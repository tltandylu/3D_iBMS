"""點位綁定管理路由 — /api/monitoring-points & /api/model-point-bindings & /api/control"""
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.auth import require_roles
from app.db.session import get_db
from app.db.repository import DBRepository

router = APIRouter(tags=["point-bindings"])

# ── Seed monitoring points ────────────────────────────────────────────────
_SEED_POINTS = [
    # DI - Digital Input (狀態回饋)
    {"point_id": "DI-HVAC-001", "point_code": "DI001", "point_name": "AHU-01 運轉狀態",      "point_type": "DI", "system_type": "HVAC",    "equipment_name": "AHU-01",     "unit": "",    "normal_value": "0", "alarm_value": "1",  "min_value": None, "max_value": None, "description": "空調箱運轉狀態 0=停 1=轉"},
    {"point_id": "DI-HVAC-002", "point_code": "DI002", "point_name": "AHU-02 運轉狀態",      "point_type": "DI", "system_type": "HVAC",    "equipment_name": "AHU-02",     "unit": "",    "normal_value": "0", "alarm_value": "1",  "min_value": None, "max_value": None, "description": "空調箱運轉狀態"},
    {"point_id": "DI-HVAC-003", "point_code": "DI003", "point_name": "冷水主機 故障警報",     "point_type": "DI", "system_type": "HVAC",    "equipment_name": "CHW-01",     "unit": "",    "normal_value": "0", "alarm_value": "1",  "min_value": None, "max_value": None, "description": "冷水主機故障"},
    {"point_id": "DI-FIRE-001", "point_code": "DI004", "point_name": "消防泵浦 運轉狀態",    "point_type": "DI", "system_type": "Fire",    "equipment_name": "FPS-01",     "unit": "",    "normal_value": "0", "alarm_value": "1",  "min_value": None, "max_value": None, "description": "消防泵浦運轉回饋"},
    {"point_id": "DI-POWER-001","point_code": "DI005", "point_name": "UPS 異常警報",         "point_type": "DI", "system_type": "Power",   "equipment_name": "UPS-01",     "unit": "",    "normal_value": "0", "alarm_value": "1",  "min_value": None, "max_value": None, "description": "UPS 故障或過載"},
    {"point_id": "DI-SEC-001",  "point_code": "DI006", "point_name": "B1 門禁異常",          "point_type": "DI", "system_type": "Security","equipment_name": "CCTV-01",    "unit": "",    "normal_value": "0", "alarm_value": "1",  "min_value": None, "max_value": None, "description": "門禁異常強開"},
    # DO - Digital Output (控制)
    {"point_id": "DO-HVAC-001", "point_code": "DO001", "point_name": "AHU-01 啟停控制",      "point_type": "DO", "system_type": "HVAC",    "equipment_name": "AHU-01",     "unit": "",    "normal_value": "0", "alarm_value": None, "min_value": None, "max_value": None, "description": "AHU 啟動/停止控制"},
    {"point_id": "DO-HVAC-002", "point_code": "DO002", "point_name": "冷卻水泵 啟停",        "point_type": "DO", "system_type": "HVAC",    "equipment_name": "CWP-01",     "unit": "",    "normal_value": "0", "alarm_value": None, "min_value": None, "max_value": None, "description": "冷卻水泵啟停"},
    {"point_id": "DO-LIGHT-001","point_code": "DO003", "point_name": "B1 照明 ON/OFF",       "point_type": "DO", "system_type": "Electrical","equipment_name": "LGT-01",   "unit": "",    "normal_value": "0", "alarm_value": None, "min_value": None, "max_value": None, "description": "地下室照明控制"},
    {"point_id": "DO-GEN-001",  "point_code": "DO004", "point_name": "發電機 緊急啟動",      "point_type": "DO", "system_type": "Power",   "equipment_name": "ENG-01",     "unit": "",    "normal_value": "0", "alarm_value": None, "min_value": None, "max_value": None, "description": "緊急發電機啟動命令"},
    # AI - Analog Input (量測)
    {"point_id": "AI-HVAC-001", "point_code": "AI001", "point_name": "AHU-01 送風溫度",      "point_type": "AI", "system_type": "HVAC",    "equipment_name": "AHU-01",     "unit": "°C",  "normal_value": None, "alarm_value": None, "min_value": 0.0,  "max_value": 50.0,  "warning_low": None, "alarm_low": None, "warning_high": 42.0, "alarm_high": 48.0,  "description": "送風側溫度感測"},
    {"point_id": "AI-HVAC-002", "point_code": "AI002", "point_name": "冷水主機 出水溫度",    "point_type": "AI", "system_type": "HVAC",    "equipment_name": "CHW-01",     "unit": "°C",  "normal_value": None, "alarm_value": None, "min_value": 0.0,  "max_value": 20.0,  "warning_low": None, "alarm_low": None, "warning_high": 16.0, "alarm_high": 18.0,  "description": "冷水主機冷水出水溫度"},
    {"point_id": "AI-HVAC-003", "point_code": "AI003", "point_name": "機房 環境溫度",        "point_type": "AI", "system_type": "HVAC",    "equipment_name": "SRV-01",     "unit": "°C",  "normal_value": None, "alarm_value": None, "min_value": 10.0, "max_value": 40.0,  "warning_low": 12.0, "alarm_low": 10.0, "warning_high": 35.0, "alarm_high": 38.0,  "description": "機房環境溫度"},
    {"point_id": "AI-POWER-001","point_code": "AI004", "point_name": "總電力需量",           "point_type": "AI", "system_type": "Power",   "equipment_name": "UPS-01",     "unit": "kW",  "normal_value": None, "alarm_value": None, "min_value": 0.0,  "max_value": 2000.0,"warning_low": None, "alarm_low": None, "warning_high": 1600.0,"alarm_high": 1900.0,"description": "整棟總用電需量"},
    {"point_id": "AI-POWER-002","point_code": "AI005", "point_name": "主電盤 電流",          "point_type": "AI", "system_type": "Power",   "equipment_name": "UPS-01",     "unit": "A",   "normal_value": None, "alarm_value": None, "min_value": 0.0,  "max_value": 500.0, "warning_low": None, "alarm_low": None, "warning_high": 400.0, "alarm_high": 480.0, "description": "主電盤三相電流"},
    {"point_id": "AI-ENV-001",  "point_code": "AI006", "point_name": "大廳 CO2 濃度",        "point_type": "AI", "system_type": "HVAC",    "equipment_name": "AHU-01",     "unit": "ppm", "normal_value": None, "alarm_value": None, "min_value": 400.0,"max_value": 2000.0,"warning_low": None, "alarm_low": None, "warning_high": 1000.0,"alarm_high": 1500.0,"description": "大廳 CO2 濃度監測"},
    {"point_id": "AI-FIRE-001", "point_code": "AI007", "point_name": "消防水槽 水位",        "point_type": "AI", "system_type": "Fire",    "equipment_name": "FPS-01",     "unit": "m",   "normal_value": None, "alarm_value": None, "min_value": 0.0,  "max_value": 5.0,   "warning_low": 1.0,  "alarm_low": 0.5,  "warning_high": None,  "alarm_high": None,  "description": "消防蓄水槽液位"},
    # AO - Analog Output (設定控制)
    {"point_id": "AO-HVAC-001", "point_code": "AO001", "point_name": "AHU-01 冷水閥開度",   "point_type": "AO", "system_type": "HVAC",    "equipment_name": "AHU-01",     "unit": "%",   "normal_value": None, "alarm_value": None, "min_value": 0.0,  "max_value": 100.0,"description": "AHU 冷水閥開度設定"},
    {"point_id": "AO-HVAC-002", "point_code": "AO002", "point_name": "變頻器 頻率設定",      "point_type": "AO", "system_type": "HVAC",    "equipment_name": "CT-01",      "unit": "Hz",  "normal_value": None, "alarm_value": None, "min_value": 15.0, "max_value": 60.0, "description": "冷卻塔風機變頻器"},
    {"point_id": "AO-ENV-001",  "point_code": "AO003", "point_name": "室內溫度設定值",       "point_type": "AO", "system_type": "HVAC",    "equipment_name": "AHU-02",     "unit": "°C",  "normal_value": None, "alarm_value": None, "min_value": 16.0, "max_value": 30.0, "description": "室內溫度目標設定"},
]

_SEED_BINDINGS = [
    {"model_uuid": "chw-01", "model_name": "冷水主機 CHW-01", "point_id": "AI-HVAC-002", "point_type": "AI", "display_mode": "value_panel", "normal_color": "#22C55E", "alarm_color": "#EF4444", "offline_color": "#9CA3AF", "control_enabled": False, "value_position": "top"},
    {"model_uuid": "ahu-01", "model_name": "空調箱 AHU-01",   "point_id": "AI-HVAC-001", "point_type": "AI", "display_mode": "value_panel", "normal_color": "#22C55E", "alarm_color": "#EF4444", "offline_color": "#9CA3AF", "control_enabled": False, "value_position": "right"},
    {"model_uuid": "ahu-01", "model_name": "空調箱 AHU-01",   "point_id": "DO-HVAC-001", "point_type": "DO", "display_mode": "color",       "normal_color": "#22C55E", "alarm_color": "#38BDF8", "offline_color": "#9CA3AF", "control_enabled": True,  "value_position": "auto"},
    {"model_uuid": "fps-01", "model_name": "消防泵浦 FPS-01", "point_id": "DI-FIRE-001", "point_type": "DI", "display_mode": "color",       "normal_color": "#22C55E", "alarm_color": "#EF4444", "offline_color": "#9CA3AF", "control_enabled": False, "value_position": "auto"},
    {"model_uuid": "lgt-01", "model_name": "照明設備 LGT-01", "point_id": "DO-LIGHT-001","point_type": "DO", "display_mode": "color",       "normal_color": "#FDE68A", "alarm_color": "#9CA3AF", "offline_color": "#6B7280", "control_enabled": True,  "value_position": "auto"},
    {"model_uuid": "ups-01", "model_name": "UPS UPS-01",      "point_id": "AI-POWER-001","point_type": "AI", "display_mode": "value_panel", "normal_color": "#22C55E", "alarm_color": "#EF4444", "offline_color": "#9CA3AF", "control_enabled": False, "value_position": "right"},
]


async def seed_if_empty(db: DBRepository) -> None:
    if await db.monitoring_point_count() == 0:
        now = datetime.now().isoformat()
        for p in _SEED_POINTS:
            await db.upsert_monitoring_point({
                "id": str(uuid.uuid4()),
                "created_at": now,
                **p,
            })
    if await db.binding_count() == 0:
        now = datetime.now().isoformat()
        for b in _SEED_BINDINGS:
            await db.upsert_model_point_binding({
                "id": str(uuid.uuid4()),
                "created_at": now,
                "is_active": True,
                "control_enabled": 1 if b["control_enabled"] else 0,
                **{k: v for k, v in b.items() if k != "control_enabled"},
            })


# ── Pydantic schemas ──────────────────────────────────────────────────────

class PointCreate(BaseModel):
    point_id: str
    point_code: str
    point_name: str
    point_type: str
    system_type: str = ""
    equipment_name: str = ""
    unit: str = ""
    normal_value: str | None = None
    alarm_value: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    warning_low: float | None = None
    alarm_low: float | None = None
    warning_high: float | None = None
    alarm_high: float | None = None
    description: str = ""


class BindingCreate(BaseModel):
    model_uuid: str
    model_name: str = ""
    point_id: str
    point_type: str
    display_mode: str = "color"
    normal_color: str = "#22C55E"
    alarm_color: str = "#EF4444"
    offline_color: str = "#9CA3AF"
    control_enabled: bool = False
    value_position: str = "auto"


# ── Monitoring Points endpoints ───────────────────────────────────────────

@router.get("/api/monitoring-points")
async def list_points(
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    await seed_if_empty(db)
    return await db.list_monitoring_points()


@router.post("/api/monitoring-points", status_code=201)
async def create_point(
    body: PointCreate,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator")),
):
    pid = str(uuid.uuid4())
    now = datetime.now().isoformat()
    await db.upsert_monitoring_point({"id": pid, "created_at": now, **body.model_dump()})
    return {"id": pid}


@router.delete("/api/monitoring-points/{point_id}", status_code=204)
async def delete_point(
    point_id: str,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin")),
):
    await db.delete_monitoring_point(point_id)


# ── Model-Point Bindings endpoints ────────────────────────────────────────

@router.get("/api/model-point-bindings")
async def list_bindings(
    model_uuid: str | None = None,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    await seed_if_empty(db)
    return await db.list_model_point_bindings(model_uuid)


@router.post("/api/model-point-bindings", status_code=201)
async def create_binding(
    body: BindingCreate,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator")),
):
    bid = str(uuid.uuid4())
    now = datetime.now().isoformat()
    data = body.model_dump()
    data["control_enabled"] = 1 if data["control_enabled"] else 0
    await db.upsert_model_point_binding({"id": bid, "created_at": now, "is_active": 1, **data})
    return {"id": bid}


@router.delete("/api/model-point-bindings/{binding_id}", status_code=204)
async def delete_binding(
    binding_id: str,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator")),
):
    await db.delete_model_point_binding(binding_id)


# ── Control Command endpoint ──────────────────────────────────────────────

class ControlCommand(BaseModel):
    point_id: str
    model_uuid: str
    value: float


@router.post("/api/control")
async def send_control(
    body: ControlCommand,
    request: Request,
    db: DBRepository = Depends(get_db),
    current_user: dict = Depends(require_roles("admin", "operator")),
):
    issued_by = current_user.get("sub", "unknown")
    now = datetime.now().isoformat()
    log_id = str(uuid.uuid4())

    manager = request.app.state.manager
    await manager.broadcast({
        "type": "point_control",
        "payload": {
            "point_id": body.point_id,
            "model_uuid": body.model_uuid,
            "value": body.value,
            "issued_by": issued_by,
        },
        "timestamp": now,
    })

    await db.create_control_log({
        "id":         log_id,
        "point_id":   body.point_id,
        "model_uuid": body.model_uuid,
        "value":      body.value,
        "issued_by":  issued_by,
        "result":     "sent",
        "created_at": now,
    })
    return {"status": "sent", "point_id": body.point_id, "value": body.value, "log_id": log_id}


@router.get("/api/control-logs")
async def list_control_logs(
    limit: int = 100,
    point_id: str | None = None,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    return await db.list_control_logs(limit=limit, point_id=point_id)


@router.get("/api/point-values")
async def get_point_values(
    request: Request,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    # 先從 DB 取持久化值；再用 IoT 模擬器的即時記憶體覆蓋（若存在）
    db_vals = await db.get_point_realtime_values()
    sim = getattr(request.app.state, "simulator", None)
    if sim is not None:
        db_vals.update(sim._point_values)
    return db_vals
