"""
AMR / AGV 車隊遙測模擬器
─────────────────────────────────────────────────────────────────────────────
依《3D 監控管理平台自主移動機器人即時動態位置顯示模組規格書》V1.0.0 實作：

* §4.1  以既有 WebSocket 通道推播，頻率 10 ~ 15 Hz（預設 10 Hz）
* §4.2  遙測封包 schema（ROBOT_TELEMETRY）
* §5.1  機器人本體採 ROS 原生坐標系（x 前、y 左、z 上；每層樓各自建圖，z=0）
        → 轉換至 3D 建築世界坐標由前端套用校準矩陣完成（見 robot_calibration.py）
* §8.2  位置跳躍防護（瞬時速度 > MAX_PLAUSIBLE_SPEED 判定為定位漂移，捨棄該幀）

本模組同時作為「真實 AMR 資料源」的介面雛形：
外部 MQTT / ROSBridge 閘道可呼叫 RobotFleet.ingest_external()，
即可共用同一套合理性檢查與 WS 推播路徑（見 routers/robots.py）。
"""
import asyncio
import logging
import math
import os
import random
import time
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from app import robot_routes   # 動線由外部設定檔提供（見該模組說明）

if TYPE_CHECKING:
    from app.ws_manager import ConnectionManager

logger = logging.getLogger(__name__)

# ── 規格參數 ────────────────────────────────────────────────────────────────
TELEMETRY_HZ         = float(os.getenv("ROBOT_TELEMETRY_HZ", "10"))   # §4.1 10~15 Hz
MAX_PLAUSIBLE_SPEED  = float(os.getenv("ROBOT_MAX_SPEED", "3.5"))     # §8.2 m/s 物理上限
SIGNAL_DROP_ENABLED  = os.getenv("ROBOT_SIM_SIGNAL_DROP", "1") == "1"
ROBOT_ALERT_COOLDOWN = 180.0   # 同一台機器人告警冷卻（秒）

STATES = ("IDLE", "RUNNING", "CHARGING", "BLOCKED", "ERROR", "OFFLINE")

_robot_alert_counter = 0


def _norm_deg(deg: float) -> float:
    """角度正規化至 [0, 360)"""
    return deg % 360.0


def _ang_diff(target: float, current: float) -> float:
    """最短路徑角差（度），範圍 (-180, 180]"""
    d = (target - current + 180.0) % 360.0 - 180.0
    return d + 360.0 if d <= -180.0 else d


class RobotRuntime:
    """單台機器人的即時狀態（ROS 原生坐標）"""

    def __init__(self, cfg: dict[str, Any]) -> None:
        self.device_id = cfg["device_id"]
        self.last_pub_pos: Optional[tuple[float, float, float]] = None  # (x, y, t)
        self.apply_config(cfg, initial=True)

    # ── 套用（或熱更新）動線設定 ───────────────────────────
    def apply_config(self, cfg: dict[str, Any], initial: bool = False) -> None:
        self.device_name = cfg.get("device_name", self.device_id)
        self.floor_id    = cfg.get("floor_id", "FL-01")
        self.model       = cfg.get("model", "")
        self.max_speed   = float(cfg.get("max_speed", 1.0))
        self.loop        = bool(cfg.get("loop", True))
        self.waypoints: list[dict[str, Any]] = list(cfg["waypoints"])
        ch = cfg.get("charger") or {}
        self.charger = (float(ch.get("x", self.waypoints[0]["x"])),
                        float(ch.get("y", self.waypoints[0]["y"])))

        if initial:
            self.x, self.y   = float(self.waypoints[0]["x"]), float(self.waypoints[0]["y"])
            self.yaw         = 0.0          # deg，繞 ROS z 軸（上）
            self.wp_index    = 1 % len(self.waypoints)
            self.direction   = 1            # loop=False 時用於原路折返
            self.linear_v    = 0.0
            self.angular_v   = 0.0
            self.state       = "RUNNING"
            self.battery     = random.uniform(55.0, 95.0)
            self.alarm_level = 0
            self.task_id: Optional[str] = f"TASK-{datetime.now():%Y%m}-{random.randint(1, 999):03d}"
            self.hold_until   = 0.0         # IDLE / BLOCKED 解除時間
            self.silent_until = 0.0         # 模擬訊號遺失（停止推播）
            self.mileage_m    = random.uniform(120.0, 4800.0)
        else:
            # 熱更新：保留運行狀態，僅把索引夾回新動線範圍
            self.wp_index = min(self.wp_index, len(self.waypoints) - 1)
        self.target_station = str(self.waypoints[self.wp_index].get("station", ""))

    # ── 目標點 ───────────────────────────────────────────────
    @property
    def goal(self) -> tuple[float, float]:
        if self.state == "CHARGING" or (self.battery < 20.0 and self.state != "ERROR"):
            return self.charger
        wp = self.waypoints[self.wp_index]
        return float(wp["x"]), float(wp["y"])

    @property
    def current_waypoint(self) -> dict[str, Any]:
        return self.waypoints[self.wp_index]

    def _advance_waypoint(self) -> None:
        n = len(self.waypoints)
        if self.loop:
            self.wp_index = (self.wp_index + 1) % n
        else:
            # 非循環動線：抵達端點後原路折返
            nxt = self.wp_index + self.direction
            if nxt >= n or nxt < 0:
                self.direction *= -1
                nxt = self.wp_index + self.direction
            self.wp_index = max(0, min(n - 1, nxt))
        self.target_station = str(self.waypoints[self.wp_index].get("station", ""))

    # ── 每幀運動積分 ─────────────────────────────────────────
    def step(self, dt: float, now: float) -> None:
        if self.state == "ERROR":
            self.linear_v = self.angular_v = 0.0
            if random.random() < 0.004:          # 約 25 秒後人工排除
                self.state, self.alarm_level = "RUNNING", 0
            return

        if self.state == "BLOCKED":
            self.linear_v = self.angular_v = 0.0
            if now >= self.hold_until:
                self.state, self.alarm_level = "RUNNING", 0
            return

        if self.state == "CHARGING":
            self.linear_v = self.angular_v = 0.0
            self.battery = min(100.0, self.battery + dt * 0.45)   # 約 4 分鐘充滿
            if self.battery >= 95.0:
                self.state, self.alarm_level = "RUNNING", 0
            return

        if self.state == "IDLE":
            self.linear_v = self.angular_v = 0.0
            if now >= self.hold_until:
                self.state = "RUNNING"
            return

        # 低電量預警
        if self.battery <= 18.0:
            self.alarm_level = max(self.alarm_level, 1)

        gx, gy = self.goal
        dx, dy = gx - self.x, gy - self.y
        dist   = math.hypot(dx, dy)

        # 抵達判定
        if dist < 0.25:
            if self.battery < 20.0:
                self.state = "CHARGING"
                return
            dwell = float(self.current_waypoint.get("dwell_sec", 0) or 0)
            self._advance_waypoint()
            self.task_id = f"TASK-{datetime.now():%Y%m}-{random.randint(1, 999):03d}"
            if dwell > 0:                        # 站點作業停留（依動線設定）
                self.state = "IDLE"
                self.hold_until = now + dwell
            return

        # 轉向（先轉再走，模擬差速輪 AMR）
        target_yaw = _norm_deg(math.degrees(math.atan2(dy, dx)))
        delta      = _ang_diff(target_yaw, self.yaw)
        max_turn   = 90.0 * dt                    # 90 deg/s
        turn       = max(-max_turn, min(max_turn, delta))
        self.yaw   = _norm_deg(self.yaw + turn)
        self.angular_v = round(math.radians(turn) / dt, 3) if dt > 0 else 0.0

        align  = max(0.0, math.cos(math.radians(abs(delta))))   # 未對準時減速
        speed  = self.max_speed * (0.35 + 0.65 * align)
        speed  = min(speed, dist / max(dt, 1e-3))
        rad    = math.radians(self.yaw)
        self.x += math.cos(rad) * speed * dt
        self.y += math.sin(rad) * speed * dt
        self.linear_v = round(speed, 3)
        self.mileage_m += speed * dt
        self.battery = max(0.0, self.battery - dt * 0.035)

        # 隨機事件：避障停等 / 故障 / 訊號遺失
        if random.random() < 0.0016:
            self.state, self.hold_until = "BLOCKED", now + random.uniform(2.0, 6.0)
            self.alarm_level = 1
        elif random.random() < 0.00022:
            self.state, self.alarm_level = "ERROR", 2
        elif SIGNAL_DROP_ENABLED and random.random() < 0.00018:
            self.silent_until = now + random.uniform(4.0, 8.0)

    # ── 遙測封包（§4.2）───────────────────────────────────────
    def to_packet(self, ts_ms: int) -> dict[str, Any]:
        return {
            "version": "1.0",
            "msg_type": "ROBOT_TELEMETRY",
            "device_id": self.device_id,
            "device_name": self.device_name,
            "timestamp": ts_ms,
            "floor_id": self.floor_id,
            "model": self.model,
            "pose": {
                "x": round(self.x, 3), "y": round(self.y, 3), "z": 0.0,
                "yaw": round(self.yaw, 2), "pitch": 0.0, "roll": 0.0,
            },
            "motion": {
                "linear_velocity": round(self.linear_v, 3),
                "angular_velocity": round(self.angular_v, 3),
            },
            "status": {
                "state": self.state,
                "battery_pct": int(round(self.battery)),
                "alarm_level": self.alarm_level,
                "current_task_id": self.task_id,
                "target_station": self.target_station,
                "current_action": str(self.current_waypoint.get("action", "move")),
                "mileage_m": round(self.mileage_m, 1),
            },
        }


def sanity_check(prev: Optional[tuple[float, float, float]],
                 x: float, y: float, t: float) -> tuple[bool, float]:
    """§8.2 位置跳躍防護：回傳 (是否合理, 瞬時速度 m/s)"""
    if prev is None:
        return True, 0.0
    px, py, pt = prev
    dt = t - pt
    if dt <= 0:
        return True, 0.0
    speed = math.hypot(x - px, y - py) / dt
    return speed <= MAX_PLAUSIBLE_SPEED, speed


def floor_id_to_index(floor_id: str) -> int:
    """'FL-03' → 3、'B1' → -1（供既有告警的 floor 欄位使用）"""
    fid = (floor_id or "").upper().strip()
    if fid.startswith("B"):
        try:
            return -int(fid[1:])
        except ValueError:
            return -1
    if fid.startswith("FL-"):
        try:
            return int(fid[3:])
        except ValueError:
            return 1
    return 1


class RobotFleet:
    """車隊模擬與遙測推播（可由外部真實資料源接管）"""

    def __init__(self, manager: "ConnectionManager", store: Any = None) -> None:
        self.manager  = manager
        self.store    = store
        self._running = False
        cfg = robot_routes.load_routes()
        self._robots: dict[str, RobotRuntime] = {
            c["device_id"]: RobotRuntime(c) for c in cfg["robots"]
        }
        self._last_alert: dict[str, float] = {}
        self._last_route_check = 0.0
        self._external_mode = False   # 收到外部遙測後停用內建模擬

    # ── 動線熱套用（robot_routes.json 變更時）────────────────
    def apply_routes(self, cfg: dict[str, Any]) -> None:
        wanted = {r["device_id"]: r for r in cfg["robots"]}
        for did in list(self._robots):
            if did not in wanted:
                del self._robots[did]           # 設定檔已移除的車輛
        for did, rcfg in wanted.items():
            if did in self._robots:
                self._robots[did].apply_config(rcfg)
            else:
                self._robots[did] = RobotRuntime(rcfg)
        logger.info("[Robot] 動線已熱套用：%d 台", len(self._robots))

    # ── 查詢 ────────────────────────────────────────────────
    def snapshot(self) -> list[dict[str, Any]]:
        ts = int(time.time() * 1000)
        return [r.to_packet(ts) for r in self._robots.values()]

    def get(self, device_id: str) -> Optional[dict[str, Any]]:
        r = self._robots.get(device_id)
        return r.to_packet(int(time.time() * 1000)) if r else None

    @property
    def external_mode(self) -> bool:
        return self._external_mode

    # ── 外部真實遙測注入（MQTT / ROSBridge 閘道呼叫）──────────
    async def ingest_external(self, packet: dict[str, Any]) -> dict[str, Any]:
        """驗證外部遙測封包並轉發；回傳處理結果"""
        did = str(packet.get("device_id", "")).strip()
        if not did:
            return {"accepted": False, "reason": "device_id 缺失"}
        pose = packet.get("pose") or {}
        try:
            x, y = float(pose["x"]), float(pose["y"])
        except (KeyError, TypeError, ValueError):
            return {"accepted": False, "reason": "pose.x / pose.y 格式錯誤"}

        now  = time.time()
        prev = self._robots[did].last_pub_pos if did in self._robots else None
        ok, speed = sanity_check(prev, x, y, now)
        if not ok:
            logger.warning("[Robot] %s 定位漂移，捨棄該幀（瞬時 %.2f m/s > %.1f）",
                           did, speed, MAX_PLAUSIBLE_SPEED)
            return {"accepted": False, "reason": f"定位漂移 {speed:.2f} m/s", "speed": speed}

        self._external_mode = True
        if did in self._robots:
            self._robots[did].last_pub_pos = (x, y, now)
        await self.manager.broadcast({
            "type": "robot_telemetry",
            "payload": {"version": "1.0", "msg_type": "ROBOT_TELEMETRY", "robots": [packet]},
            "timestamp": datetime.now().isoformat(),
        })
        return {"accepted": True, "speed": speed}

    # ── 主迴圈 ──────────────────────────────────────────────
    async def start(self) -> None:
        self._running = True
        period = 1.0 / max(1.0, min(20.0, TELEMETRY_HZ))
        logger.info("[Robot] 車隊遙測啟動：%d 台 @ %.1f Hz", len(self._robots), 1.0 / period)
        last = time.time()
        while self._running:
            await asyncio.sleep(period)
            now = time.time()
            dt  = min(0.5, now - last)   # 避免排程延遲造成大跳步
            last = now
            # 每 2 秒檢查動線設定是否被外部修改（外部配置化 / 熱加載）
            if now - self._last_route_check > 2.0:
                self._last_route_check = now
                if robot_routes.routes_changed():
                    self.apply_routes(robot_routes.load_routes())

            if self._external_mode:
                continue                  # 已由真實資料源接管

            packets: list[dict[str, Any]] = []
            ts_ms = int(now * 1000)
            for r in self._robots.values():
                r.step(dt, now)
                if now < r.silent_until:
                    continue              # 模擬訊號遺失 → 前端 3 秒後標記 SIGNAL_LOST
                ok, speed = sanity_check(r.last_pub_pos, r.x, r.y, now)
                if not ok:
                    logger.warning("[Robot] %s 定位漂移，捨棄該幀（%.2f m/s）", r.device_id, speed)
                    continue
                r.last_pub_pos = (r.x, r.y, now)
                packets.append(r.to_packet(ts_ms))

            if packets:
                await self.manager.broadcast({
                    "type": "robot_telemetry",
                    "payload": {"version": "1.0", "msg_type": "ROBOT_TELEMETRY", "robots": packets},
                    "timestamp": datetime.now().isoformat(),
                })
            await self._check_robot_alarms(now)

    async def stop(self) -> None:
        self._running = False

    # ── 告警聯動（§10 階段三：與既有告警事件整合）──────────────
    async def _check_robot_alarms(self, now: float) -> None:
        global _robot_alert_counter
        if self.store is None:
            return
        for r in self._robots.values():
            if r.alarm_level < 2:
                continue
            if now - self._last_alert.get(r.device_id, 0.0) < ROBOT_ALERT_COOLDOWN:
                continue
            self._last_alert[r.device_id] = now
            _robot_alert_counter += 1
            from app.models import Alert
            alert = Alert(
                id=f"al-amr-{_robot_alert_counter}",
                asset_id=r.device_id,
                asset_name=r.device_name,
                title=f"{r.device_id} 機器人故障停機",
                description=(f"狀態 {r.state}／電量 {int(r.battery)}%／"
                             f"位置 ({r.x:.1f}, {r.y:.1f}) @ {r.floor_id}"),
                severity="ALARM",
                status="open",
                occurred_at=datetime.now().isoformat(),
                ai_root_cause="AI 分析中...",
                floor=floor_id_to_index(r.floor_id),
                building_id="locus",
            )
            self.store.alerts.insert(0, alert)
            self.store.alerts = self.store.alerts[:30]
            self.store.kpi.open_alerts += 1
            await self.manager.broadcast({
                "type": "alert_new",
                "payload": alert.model_dump(),
                "timestamp": datetime.now().isoformat(),
            })
            logger.info("[Robot] 告警 %s → %s", r.device_id, alert.title)
