"""
AMR / AGV 動線設定（外部配置化）
─────────────────────────────────────────────────────────────────────────────
動線以 `robot_routes.json` 管理，沿用 robot_calibration.py 同一套熱加載模式
（依 mtime 重載，改檔即生效、免重啟），可納入版控與現場交付。

座標一律使用「機器人原生導航坐標系」（ROS：x 前、y 左，單位 m，每層樓各自建圖），
顯示時由前端套用校準矩陣 M_align 轉為 3D 世界坐標——因此調整動線不需改動任何前端程式。

設定檔結構：
{
  "robots": [
    {
      "device_id":   "AMR-P01",
      "device_name": "無人物料搬運車 01",
      "model":       "AMR-Lifter-500",
      "floor_id":    "B2",
      "max_speed":   1.2,            # m/s
      "loop":        true,           # true=循環；false=到端點後原路折返
      "charger":     { "x": -10.5, "y": -7.5 },
      "waypoints": [
        { "station": "ST-B2-01", "x": -9.0, "y": -6.0, "dwell_sec": 2, "action": "pick" },
        { "station": "ST-B2-02", "x":  9.0, "y": -6.0, "dwell_sec": 0 }
      ]
    }
  ]
}
"""
import json
import logging
import os
import threading
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

ROUTES_PATH = os.getenv(
    "ROBOT_ROUTES_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "robot_routes.json"),
)

VALID_ACTIONS = {"", "move", "pick", "drop", "inspect", "charge", "wait"}
MAX_ROBOTS    = 200
MAX_WAYPOINTS = 200
COORD_LIMIT   = 500.0    # m，超出視為輸入錯誤（避免手滑打成 mm）

_lock = threading.Lock()
_cache: Optional[dict[str, Any]] = None
_cache_mtime: float = 0.0


# ── 內建預設動線（樂迦大樓示範車隊）──────────────────────────────────────
def default_routes() -> dict[str, Any]:
    def wp(station: str, x: float, y: float, dwell: float = 0.0, action: str = "move"):
        return {"station": station, "x": x, "y": y, "dwell_sec": dwell, "action": action}

    return {
        "version": "1.0",
        "site_id": "locus",
        "updated_at": datetime.now().isoformat(),
        "robots": [
            {
                "device_id": "AMR-P01", "device_name": "無人物料搬運車 01",
                "model": "AMR-Lifter-500", "floor_id": "B2",
                "max_speed": 1.20, "loop": True, "charger": {"x": -10.5, "y": -7.5},
                "waypoints": [
                    wp("ST-B2-01", -9.0, -6.0, 2.0, "pick"),
                    wp("ST-B2-02",  9.0, -6.0, 0.0),
                    wp("ST-B2-03",  9.0,  6.0, 2.0, "drop"),
                    wp("ST-B2-04", -9.0,  6.0, 0.0),
                ],
            },
            {
                "device_id": "AMR-P02", "device_name": "無人物料搬運車 02",
                "model": "AMR-Lifter-500", "floor_id": "B1",
                "max_speed": 1.10, "loop": True, "charger": {"x": -10.0, "y": 6.5},
                "waypoints": [
                    wp("ST-B1-01", -8.0,  5.0, 1.5, "pick"),
                    wp("ST-B1-02",  8.0,  5.0, 0.0),
                    wp("ST-B1-03",  8.0, -5.0, 1.5, "drop"),
                    wp("ST-B1-04",  0.0, -5.0, 0.0),
                    wp("ST-B1-05",  0.0,  5.0, 0.0),
                ],
            },
            {
                "device_id": "AGV-L01", "device_name": "自動導引車 L01",
                "model": "AGV-Tug-300", "floor_id": "FL-01",
                "max_speed": 0.90, "loop": True, "charger": {"x": -9.5, "y": -6.0},
                "waypoints": [
                    wp("ST-1F-LOBBY", -7.0, -4.0, 3.0, "wait"),
                    wp("ST-1F-DOCK",   7.0, -4.0, 2.0, "pick"),
                    wp("ST-1F-NE",     7.0,  4.0, 0.0),
                    wp("ST-1F-NW",    -7.0,  4.0, 0.0),
                ],
            },
            {
                "device_id": "INS-R01", "device_name": "自動巡檢機器人 R01",
                "model": "Inspector-Pro", "floor_id": "FL-03",
                "max_speed": 0.75, "loop": True, "charger": {"x": -8.5, "y": -7.0},
                "waypoints": [
                    wp("ST-3F-AHU", -6.0,  0.0, 4.0, "inspect"),
                    wp("ST-3F-N",    0.0,  6.0, 0.0),
                    wp("ST-3F-EPS",  6.0,  0.0, 4.0, "inspect"),
                    wp("ST-3F-S",    0.0, -6.0, 0.0),
                ],
            },
            {
                "device_id": "INS-R02", "device_name": "自動巡檢機器人 R02",
                "model": "Inspector-Pro", "floor_id": "FL-05",
                "max_speed": 0.80, "loop": True, "charger": {"x": -9.0, "y": 5.5},
                "waypoints": [
                    wp("ST-5F-N", -7.5,  3.0, 3.0, "inspect"),
                    wp("ST-5F-NE", 7.5,  3.0, 0.0),
                    wp("ST-5F-S",  7.5, -3.0, 3.0, "inspect"),
                    wp("ST-5F-SW", -7.5, -3.0, 0.0),
                ],
            },
            {
                "device_id": "INS-R03", "device_name": "自動巡檢機器人 R03",
                "model": "Inspector-Lite", "floor_id": "FL-08",
                "max_speed": 0.70, "loop": True, "charger": {"x": -8.0, "y": -6.5},
                "waypoints": [
                    wp("ST-8F-01", -5.0, -5.0, 2.5, "inspect"),
                    wp("ST-8F-02",  5.0, -5.0, 0.0),
                    wp("ST-8F-03",  5.0,  5.0, 2.5, "inspect"),
                    wp("ST-8F-04", -5.0,  5.0, 0.0),
                ],
            },
        ],
    }


# ── 驗證 ────────────────────────────────────────────────────────────────
def validate_routes(cfg: dict[str, Any]) -> dict[str, Any]:
    """就地正規化並驗證；不合法時丟出帶明確訊息的 ValueError"""
    robots = cfg.get("robots")
    if not isinstance(robots, list) or not robots:
        raise ValueError("robots 必須是非空陣列")
    if len(robots) > MAX_ROBOTS:
        raise ValueError(f"機器人數量上限為 {MAX_ROBOTS} 台")

    seen: set[str] = set()
    for r in robots:
        did = str(r.get("device_id", "")).strip()
        if not did:
            raise ValueError("每台機器人都需要 device_id")
        if did in seen:
            raise ValueError(f"device_id 重複：{did}")
        seen.add(did)

        wps = r.get("waypoints")
        if not isinstance(wps, list) or len(wps) < 2:
            raise ValueError(f"{did} 的 waypoints 至少需要 2 點")
        if len(wps) > MAX_WAYPOINTS:
            raise ValueError(f"{did} 的 waypoints 上限為 {MAX_WAYPOINTS} 點")

        try:
            speed = float(r.get("max_speed", 1.0))
        except (TypeError, ValueError):
            raise ValueError(f"{did} 的 max_speed 需為數值")
        if not 0.05 <= speed <= 3.5:      # 上限對齊 §8.2 物理速度上限
            raise ValueError(f"{did} 的 max_speed 需介於 0.05 ~ 3.5 m/s（目前 {speed}）")
        r["max_speed"] = speed
        r["loop"] = bool(r.get("loop", True))
        r["floor_id"] = str(r.get("floor_id", "FL-01")).strip() or "FL-01"
        r["device_name"] = str(r.get("device_name", did))
        r["model"] = str(r.get("model", ""))

        for i, w in enumerate(wps):
            if not isinstance(w, dict):
                raise ValueError(f"{did} 第 {i + 1} 個 waypoint 格式錯誤")
            try:
                x, y = float(w["x"]), float(w["y"])
            except (KeyError, TypeError, ValueError):
                raise ValueError(f"{did} 第 {i + 1} 個 waypoint 缺少有效的 x / y")
            if abs(x) > COORD_LIMIT or abs(y) > COORD_LIMIT:
                raise ValueError(
                    f"{did} 第 {i + 1} 個 waypoint 座標超出 ±{COORD_LIMIT} m（單位是公尺，非公釐）")
            w["x"], w["y"] = x, y
            dwell = float(w.get("dwell_sec", 0) or 0)
            if dwell < 0 or dwell > 600:
                raise ValueError(f"{did} 第 {i + 1} 個 waypoint 的 dwell_sec 需介於 0 ~ 600")
            w["dwell_sec"] = dwell
            action = str(w.get("action", "move") or "move").lower()
            if action not in VALID_ACTIONS:
                raise ValueError(
                    f"{did} 第 {i + 1} 個 waypoint 的 action 不支援：{action}"
                    f"（可用：{', '.join(sorted(a for a in VALID_ACTIONS if a))}）")
            w["action"] = action
            w["station"] = str(w.get("station", f"WP-{i + 1}"))
            w["seq"] = i + 1

        ch = r.get("charger") or {}
        try:
            r["charger"] = {"x": float(ch.get("x", wps[0]["x"])), "y": float(ch.get("y", wps[0]["y"]))}
        except (TypeError, ValueError):
            raise ValueError(f"{did} 的 charger 座標格式錯誤")

    cfg.setdefault("version", "1.0")
    cfg.setdefault("site_id", "locus")
    return cfg


# ── 讀寫（熱加載）────────────────────────────────────────────────────────
def _write_unlocked(cfg: dict[str, Any]) -> None:
    global _cache_mtime
    with open(ROUTES_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    try:
        _cache_mtime = os.path.getmtime(ROUTES_PATH)
    except OSError:
        _cache_mtime = 0.0


def load_routes(force: bool = False) -> dict[str, Any]:
    """讀取動線設定；檔案 mtime 改變時自動重載，首次不存在則寫入預設值"""
    global _cache, _cache_mtime
    with _lock:
        try:
            mtime = os.path.getmtime(ROUTES_PATH)
        except OSError:
            # 檔案不存在（首次啟動或被刪除）→ 以記憶體中的設定重建檔案，
            # 從未載入過則寫入內建預設動線
            if _cache is None or force:
                _cache = validate_routes(default_routes())
                logger.info("[Robot] 動線設定不存在，改用內建預設值")
            _write_unlocked(_cache)
            return _cache

        if _cache is None or force or mtime != _cache_mtime:
            try:
                with open(ROUTES_PATH, "r", encoding="utf-8") as f:
                    cfg = validate_routes(json.load(f))
                _cache, _cache_mtime = cfg, mtime
                logger.info("[Robot] 動線設定已載入：%d 台（%s）",
                            len(cfg["robots"]), ROUTES_PATH)
            except (OSError, json.JSONDecodeError, ValueError) as e:
                logger.warning("[Robot] 動線設定無效（%s）→ 沿用前一版設定", e)
                if _cache is None:
                    _cache = validate_routes(default_routes())
                _cache_mtime = mtime   # 避免每輪重複噴同一個錯誤
        return _cache


def routes_changed() -> bool:
    """檔案是否已被外部修改（供模擬器輪詢熱套用）"""
    try:
        return os.path.getmtime(ROUTES_PATH) != _cache_mtime
    except OSError:
        return False


def save_routes(cfg: dict[str, Any]) -> dict[str, Any]:
    """驗證後寫回 JSON；失敗時不動既有檔案"""
    global _cache
    validated = validate_routes(json.loads(json.dumps(cfg)))
    validated["updated_at"] = datetime.now().isoformat()
    with _lock:
        _write_unlocked(validated)
        _cache = validated
    logger.info("[Robot] 動線設定已更新：%d 台", len(validated["robots"]))
    return validated
