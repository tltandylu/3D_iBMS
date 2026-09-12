"""
Mock IoT 模擬器
模擬 Modbus/BACnet/MQTT 設備的即時資料推送行為
"""
import asyncio
import random
import logging
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.ws_manager import ConnectionManager

logger = logging.getLogger(__name__)

ALERT_TEMPLATES = [
    {"title": "溫度感測器讀值異常", "description": "AI 偵測溫度突增 +5°C", "severity": "WARNING"},
    {"title": "電流不平衡警示",     "description": "三相電流不平衡超過 5%",   "severity": "WARNING"},
    {"title": "UPS 電池電量低",    "description": "SOC 低於 20%",            "severity": "ALARM"},
    {"title": "通訊品質劣化",       "description": "封包遺失率 12%",          "severity": "WARNING"},
    {"title": "振動感測器異常",     "description": "設備振動超標 AI 分數 0.7", "severity": "WARNING"},
]

STATUS_WEIGHTS = {
    "normal":   {"normal": 85, "warning": 10, "critical": 3, "offline": 2},
    "warning":  {"normal": 40, "warning": 45, "critical": 10, "offline": 5},
    "critical": {"normal": 5,  "warning": 25, "critical": 60, "offline": 10},
    "offline":  {"normal": 20, "warning": 20, "critical": 10, "offline": 50},
}

_alert_counter = 200

# ── 監控點位模擬初始值 ────────────────────────────────────────────────────
_POINT_DI_DO = {"DI-HVAC-001","DI-HVAC-002","DI-HVAC-003","DI-FIRE-001",
                "DI-POWER-001","DI-SEC-001","DO-HVAC-001","DO-HVAC-002",
                "DO-LIGHT-001","DO-GEN-001"}
_POINT_AI_RANGES: dict[str, tuple[float,float]] = {
    "AI-HVAC-001":  (18.0,  28.0),
    "AI-HVAC-002":  (5.0,   12.0),
    "AI-HVAC-003":  (20.0,  30.0),
    "AI-POWER-001": (300.0, 600.0),
    "AI-POWER-002": (70.0,  120.0),
    "AI-ENV-001":   (450.0, 800.0),
    "AI-FIRE-001":  (2.0,   4.5),
}
_POINT_AO_RANGES: dict[str, tuple[float,float]] = {
    "AO-HVAC-001": (0.0,  100.0),
    "AO-HVAC-002": (15.0,  60.0),
    "AO-ENV-001":  (16.0,  30.0),
}

# ── 點位告警配置（閾值超限時自動建立告警）────────────────────────────────────
# above=True: 超過 threshold 觸發；above=False: 低於 threshold 觸發
# DI/DO: alarm_val=1.0 表示點位值為 1 時觸發
_POINT_ALARM_CFG: dict[str, dict] = {
    "AI-HVAC-003":  {"device_id": "dev-001", "title": "機房環境溫度過高",  "severity": "WARNING", "above": True,  "threshold": 28.5},
    "AI-POWER-001": {"device_id": "dev-003", "title": "總電力需量異常",    "severity": "ALARM",   "above": True,  "threshold": 580.0},
    "AI-FIRE-001":  {"device_id": "dev-012", "title": "消防水槽水位過低",  "severity": "WARNING", "above": False, "threshold": 2.5},
    "DI-HVAC-003":  {"device_id": "dev-002", "title": "冷水主機故障警報",  "severity": "ALARM",   "alarm_val": 1.0},
    "DI-POWER-001": {"device_id": "dev-004", "title": "UPS 異常警報",      "severity": "ALARM",   "alarm_val": 1.0},
    "DI-FIRE-001":  {"device_id": "dev-012", "title": "消防泵浦啟動告警",  "severity": "WARNING", "alarm_val": 1.0},
}
_POINT_ALARM_COOLDOWN_SEC = 300  # 同一點位 5 分鐘內不重複告警


def _weighted_choice(weights: dict[str, int]) -> str:
    population = list(weights.keys())
    w = list(weights.values())
    return random.choices(population, weights=w, k=1)[0]


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


class IoTSimulator:
    """模擬 OT 層設備資料推播（取代真實 MQTT broker 在 POC 階段）"""

    def __init__(self, manager: "ConnectionManager", store: "DataStore",
                 session_factory=None, vapid_private_key: str = "") -> None:
        self.manager          = manager
        self.store            = store
        self.session_factory  = session_factory
        self.vapid_private_key = vapid_private_key
        self._running         = False
        self._point_alarm_last: dict[str, float] = {}  # point_id → 上次告警 timestamp
        self._point_values: dict[str, float] = {
            "DI-HVAC-001": 1.0, "DI-HVAC-002": 1.0, "DI-HVAC-003": 0.0,
            "DI-FIRE-001": 0.0, "DI-POWER-001": 0.0, "DI-SEC-001": 0.0,
            "DO-HVAC-001": 1.0, "DO-HVAC-002": 1.0, "DO-LIGHT-001": 1.0, "DO-GEN-001": 0.0,
            "AI-HVAC-001": 22.4, "AI-HVAC-002": 7.2,  "AI-HVAC-003": 24.1,
            "AI-POWER-001": 428.5, "AI-POWER-002": 92.3, "AI-ENV-001": 580.0,
            "AI-FIRE-001": 3.8,
            "AO-HVAC-001": 65.0, "AO-HVAC-002": 45.0, "AO-ENV-001": 24.0,
        }

    async def start(self) -> None:
        self._running = True
        await asyncio.gather(
            self._tick_power(),
            self._tick_status(),
            self._tick_alerts(),
            self._tick_heartbeat(),
            self._tick_metrics(),
            self._tick_point_values(),
        )

    async def stop(self) -> None:
        self._running = False

    # ── 每 2 秒：監控點位數值模擬 ─────────────────────────────
    async def _tick_point_values(self) -> None:
        while self._running:
            await asyncio.sleep(2)
            for k in list(self._point_values):
                if k in _POINT_DI_DO:
                    if random.random() < 0.04:
                        self._point_values[k] = 1.0 - self._point_values[k]
                elif k in _POINT_AI_RANGES:
                    lo, hi = _POINT_AI_RANGES[k]
                    span = hi - lo
                    v = self._point_values[k] + random.uniform(-0.5, 0.5) * span * 0.01
                    self._point_values[k] = round(_clamp(v, lo, hi), 2)
                elif k in _POINT_AO_RANGES:
                    lo, hi = _POINT_AO_RANGES[k]
                    span = hi - lo
                    v = self._point_values[k] + random.uniform(-0.2, 0.2) * span * 0.005
                    self._point_values[k] = round(_clamp(v, lo, hi), 2)
            now_ts = __import__("time").time()
            await self.manager.broadcast({
                "type": "point_values",
                "payload": {"values": dict(self._point_values)},
                "timestamp": datetime.now().isoformat(),
            })
            # ── 點位超限告警偵測 ───────────────────────────────
            await self._check_point_alarms(now_ts)

    async def _check_point_alarms(self, now_ts: float) -> None:
        global _alert_counter
        for pid, cfg in _POINT_ALARM_CFG.items():
            val = self._point_values.get(pid)
            if val is None:
                continue
            # 判斷是否觸發
            if "alarm_val" in cfg:
                triggered = abs(val - cfg["alarm_val"]) < 0.01
            else:
                triggered = val > cfg["threshold"] if cfg["above"] else val < cfg["threshold"]
            if not triggered:
                continue
            # 冷卻期檢查
            if now_ts - self._point_alarm_last.get(pid, 0) < _POINT_ALARM_COOLDOWN_SEC:
                continue
            self._point_alarm_last[pid] = now_ts
            dev = next((d for d in self.store.devices if d.id == cfg["device_id"]), None)
            if not dev:
                continue
            _alert_counter += 1
            from app.models import Alert
            new_alert = Alert(
                id=f"al-pt-{_alert_counter}",
                asset_id=dev.id,
                asset_name=dev.name,
                title=f"{dev.asset_code} {cfg['title']}",
                description=f"監控點位 {pid} 數值 {val:.2f}（閾值觸發）",
                severity=cfg["severity"],
                status="open",
                occurred_at=datetime.now().isoformat(),
                ai_root_cause="AI 分析中...",
                floor=dev.floor,
                building_id=dev.building_id,
            )
            self.store.alerts.insert(0, new_alert)
            self.store.alerts = self.store.alerts[:30]
            self.store.kpi.open_alerts += 1
            now_str = datetime.now().isoformat()
            await self.manager.broadcast({
                "type": "alert_new",
                "payload": new_alert.model_dump(),
                "timestamp": now_str,
            })
            logger.info(f"[IoT] 點位告警 {pid}={val:.2f} → {new_alert.title}")

    # ── 每 1 秒：功率 / 溫度微波動 ──────────────────────────
    async def _tick_power(self) -> None:
        while self._running:
            await asyncio.sleep(1)
            updates = []
            for d in self.store.devices:
                if d.status == "offline":
                    continue
                d.current_power_kw = _clamp(
                    d.current_power_kw + random.uniform(-1.5, 1.5),
                    0, d.current_power_kw * 1.8 + 5
                )
                if d.temperature is not None:
                    d.temperature = _clamp(
                        d.temperature + random.uniform(-0.2, 0.2), 5, 65
                    )
                # AI score drift toward status-based target
                base_score = (
                    0.78 if d.status == "critical" else
                    0.50 if d.status == "warning"  else
                    0.90 if d.status == "offline"  else 0.08
                )
                current_score = d.ai_score if d.ai_score is not None else base_score
                drift = random.uniform(-0.02, 0.02)
                d.ai_score = _clamp(current_score + drift * 0.5 + (base_score - current_score) * 0.05, 0.01, 0.99)

                updates.append({
                    "id": d.id,
                    "current_power_kw": round(d.current_power_kw, 2),
                    "temperature": round(d.temperature, 1) if d.temperature is not None else None,
                    "ai_score": round(d.ai_score, 3),
                })

            # 更新 KPI 需量
            total_pw = sum(d.current_power_kw for d in self.store.devices if d.status != "offline")
            self.store.kpi.total_power_kw = round(total_pw, 1)
            delta = random.uniform(-15, 15)
            self.store.kpi.demand_kw = _clamp(
                self.store.kpi.demand_kw + delta, 400, self.store.kpi.contract_demand_kw * 1.05
            )
            self.store.kpi.demand_ratio_pct = round(
                self.store.kpi.demand_kw / self.store.kpi.contract_demand_kw * 100, 1
            )
            self.store.kpi.today_kwh = round(self.store.kpi.today_kwh + total_pw / 3600, 2)

            await self.manager.broadcast({
                "type": "device_update",
                "payload": {"devices": updates},
                "timestamp": datetime.now().isoformat(),
            })
            await self.manager.broadcast({
                "type": "kpi_update",
                "payload": self.store.kpi.model_dump(),
                "timestamp": datetime.now().isoformat(),
            })

    # ── 每 10 秒：偶發狀態切換 ─────────────────────────────
    async def _tick_status(self) -> None:
        while self._running:
            await asyncio.sleep(10)
            if random.random() > 0.45:
                continue
            idx = random.randint(0, len(self.store.devices) - 1)
            dev = self.store.devices[idx]
            if dev.criticality == "CRITICAL" and dev.status == "critical":
                continue
            new_status = _weighted_choice(STATUS_WEIGHTS[dev.status])
            if new_status == dev.status:
                continue
            old = dev.status
            dev.status = new_status  # type: ignore[assignment]
            self._recalc_device_kpi()
            logger.info(f"[IoT] {dev.asset_code}: {old} → {new_status}")
            now = datetime.now().isoformat()
            await self.manager.broadcast({
                "type": "device_update",
                "payload": {"devices": [{"id": dev.id, "status": new_status}]},
                "timestamp": now,
            })
            # 站內通知：設備變為 offline 或 critical
            if new_status in ("offline", "critical") and self.session_factory:
                try:
                    import uuid
                    from app.db.repository import DBRepository
                    notif_type = "device_offline" if new_status == "offline" else "device_critical"
                    notif_title = f"{dev.name} {'離線' if new_status == 'offline' else '進入嚴重警告'}"
                    notif_msg   = f"{dev.asset_code} 狀態由 {old} 變更為 {new_status}"
                    severity    = "CRITICAL" if new_status in ("critical", "offline") else "WARNING"
                    notif_id    = f"notif-{uuid.uuid4().hex[:12]}"
                    async with self.session_factory() as db_session:
                        repo = DBRepository(db_session)
                        await repo.create_inbox_notification(
                            notif_id=notif_id, type=notif_type,
                            title=notif_title, message=notif_msg,
                            severity=severity, related_id=dev.id, created_at=now,
                        )
                    await self.manager.broadcast({
                        "type": "notification_new",
                        "payload": {
                            "id": notif_id, "type": notif_type,
                            "title": notif_title, "message": notif_msg,
                            "severity": severity, "related_id": dev.id,
                            "is_read": False, "created_at": now,
                        },
                        "timestamp": now,
                    })
                except Exception as e:
                    logger.warning(f"[IoT] 站內通知寫入失敗: {e}")

    # ── 每 25 秒：偶發新告警 ────────────────────────────────
    async def _tick_alerts(self) -> None:
        global _alert_counter
        while self._running:
            await asyncio.sleep(25)
            if random.random() > 0.4:
                continue
            warn_devs = [d for d in self.store.devices if d.status in ("warning", "critical")]
            if not warn_devs:
                continue
            dev = random.choice(warn_devs)
            tmpl = random.choice(ALERT_TEMPLATES)
            _alert_counter += 1
            from app.models import Alert
            new_alert = Alert(
                id=f"al-sim-{_alert_counter}",
                asset_id=dev.id,
                asset_name=dev.name,
                title=f"{dev.asset_code} {tmpl['title']}",
                description=tmpl["description"],
                severity=tmpl["severity"],  # type: ignore[arg-type]
                status="open",
                occurred_at=datetime.now().isoformat(),
                ai_root_cause="AI 分析中...",
                floor=dev.floor,
                building_id=dev.building_id,
            )
            self.store.alerts.insert(0, new_alert)
            self.store.alerts = self.store.alerts[:30]
            self.store.kpi.open_alerts += 1
            logger.info(f"[IoT] 新告警: {new_alert.title}")
            # 持久化到 DB
            if self.session_factory:
                try:
                    import uuid as _uuid
                    from app.db.repository import DBRepository
                    notif_id = f"notif-{_uuid.uuid4().hex[:12]}"
                    async with self.session_factory() as db_session:
                        repo = DBRepository(db_session)
                        await repo.upsert_alert(new_alert)
                        # 站內通知
                        await repo.create_inbox_notification(
                            notif_id=notif_id, type="alert_new",
                            title=new_alert.title, message=new_alert.description,
                            severity=new_alert.severity, related_id=new_alert.id,
                            created_at=new_alert.occurred_at,
                        )
                        # Web Push（CRITICAL / ALARM 才推送）
                        if new_alert.severity in ("CRITICAL", "ALARM"):
                            if self.vapid_private_key:
                                subs = await repo.get_push_subscriptions()
                                if subs:
                                    from app.push_service import send_push_notification
                                    push_payload = {
                                        "title":    f"【{new_alert.severity}】{new_alert.asset_name}",
                                        "body":     new_alert.title,
                                        "alert_id": new_alert.id,
                                        "url":      "/",
                                    }
                                    for sub in subs:
                                        await send_push_notification(
                                            endpoint    = sub["endpoint"],
                                            p256dh      = sub["p256dh"],
                                            auth_key    = sub["auth_key"],
                                            payload     = push_payload,
                                            private_pem = self.vapid_private_key,
                                        )
                            # Email
                            from app.email_service import send_alert_email
                            await send_alert_email(
                                severity    = new_alert.severity,
                                asset_name  = new_alert.asset_name,
                                title       = new_alert.title,
                                description = new_alert.description,
                                occurred_at = new_alert.occurred_at,
                                alert_id    = new_alert.id,
                            )
                            # Webhook
                            from app.webhook_service import try_send_webhook
                            await try_send_webhook(
                                severity    = new_alert.severity,
                                asset_name  = new_alert.asset_name,
                                title       = new_alert.title,
                                description = new_alert.description or "",
                                occurred_at = new_alert.occurred_at,
                                alert_id    = new_alert.id,
                                floor       = new_alert.floor,
                                building_id = new_alert.building_id,
                                session_factory = self.session_factory,
                            )
                    await self.manager.broadcast({
                        "type": "notification_new",
                        "payload": {
                            "id": notif_id, "type": "alert_new",
                            "title": new_alert.title, "message": new_alert.description,
                            "severity": new_alert.severity, "related_id": new_alert.id,
                            "is_read": False, "created_at": new_alert.occurred_at,
                        },
                        "timestamp": new_alert.occurred_at,
                    })
                except Exception as e:
                    logger.warning(f"[IoT] 告警 DB/Push/Email/Webhook 寫入失敗: {e}")
            await self.manager.broadcast({
                "type": "alert_new",
                "payload": new_alert.model_dump(),
                "timestamp": datetime.now().isoformat(),
            })

    # ── 每 60 秒：寫入設備指標快照 ─────────────────────────
    async def _tick_metrics(self) -> None:
        while self._running:
            await asyncio.sleep(60)
            if not self.session_factory:
                continue
            now = datetime.now().isoformat()
            rows = [
                {
                    "device_id":   d.id,
                    "recorded_at": now,
                    "power_kw":    round(d.current_power_kw, 2),
                    "temperature": round(d.temperature, 1) if d.temperature is not None else None,
                    "ai_score":    round(d.ai_score, 3) if d.ai_score is not None else None,
                    "rul_days":    d.rul_days,
                }
                for d in self.store.devices
            ]
            try:
                from app.db.repository import DBRepository
                async with self.session_factory() as db_session:
                    repo = DBRepository(db_session)
                    await repo.save_device_metrics(rows)
            except Exception as e:
                logger.warning(f"[IoT] 指標寫入 DB 失敗: {e}")

    # ── 每 30 秒：心跳 ──────────────────────────────────────
    async def _tick_heartbeat(self) -> None:
        while self._running:
            await asyncio.sleep(30)
            await self.manager.broadcast({
                "type": "heartbeat",
                "payload": {"connected_clients": self.manager.count},
                "timestamp": datetime.now().isoformat(),
            })

    def _recalc_device_kpi(self) -> None:
        devs = self.store.devices
        self.store.kpi.online_devices   = sum(1 for d in devs if d.status == "normal")
        self.store.kpi.warning_devices  = sum(1 for d in devs if d.status == "warning")
        self.store.kpi.critical_devices = sum(1 for d in devs if d.status == "critical")
        self.store.kpi.offline_devices  = sum(1 for d in devs if d.status == "offline")
        self.store.kpi.open_alerts      = sum(1 for a in self.store.alerts if a.status == "open")


class DataStore:
    """執行期共用資料倉儲（替代 DB 在 POC 階段）"""

    def __init__(self) -> None:
        from app.mock_data import DEVICES, ALERTS, WORK_ORDERS, KPI
        import copy
        self.devices     = [copy.deepcopy(d) for d in DEVICES]
        self.alerts      = [copy.deepcopy(a) for a in ALERTS]
        self.work_orders = [copy.deepcopy(w) for w in WORK_ORDERS]
        self.kpi         = copy.deepcopy(KPI)
