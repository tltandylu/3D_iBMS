from fastapi import APIRouter, HTTPException, Request, Depends
from app.models import Device
from app.db.session import get_db
from app.db.repository import DBRepository
from app.auth import require_roles
from app.limiter import limiter
from pydantic import BaseModel
from typing import Literal
import math, random
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/devices", tags=["devices"])


class ControlBody(BaseModel):
    command: Literal['restart', 'emergency_stop']


@router.get("", response_model=list[Device])
async def list_devices(request: Request):
    return request.app.state.store.devices


@router.get("/{device_id}", response_model=Device)
async def get_device(device_id: str, request: Request):
    dev = next((d for d in request.app.state.store.devices if d.id == device_id), None)
    if not dev:
        raise HTTPException(404, f"Device {device_id} not found")
    return dev


@router.patch("/{device_id}/status")
async def update_device_status(device_id: str, status: str, request: Request):
    dev = next((d for d in request.app.state.store.devices if d.id == device_id), None)
    if not dev:
        raise HTTPException(404, f"Device {device_id} not found")
    allowed = {"normal", "warning", "critical", "offline"}
    if status not in allowed:
        raise HTTPException(400, f"status must be one of {allowed}")
    dev.status = status  # type: ignore[assignment]
    await request.app.state.manager.broadcast({
        "type": "device_update",
        "payload": {"devices": [{"id": device_id, "status": status}]},
        "timestamp": datetime.now().isoformat(),
    })
    return {"ok": True, "id": device_id, "status": status}


@router.post("/{device_id}/control")
@limiter.limit("30/minute")
async def control_device(
    device_id: str, body: ControlBody, request: Request,
    db: DBRepository = Depends(get_db),
    _auth: dict = Depends(require_roles("admin", "operator")),
):
    dev = next((d for d in request.app.state.store.devices if d.id == device_id), None)
    if not dev:
        raise HTTPException(404, f"Device {device_id} not found")
    if dev.status == "offline":
        raise HTTPException(400, "Device is offline")

    if body.command == "restart":
        dev.status = "offline"
        await request.app.state.manager.broadcast({
            "type": "device_update",
            "payload": {"devices": [{"id": device_id, "status": "offline"}]},
            "timestamp": datetime.now().isoformat(),
        })
        dev.status = "normal"
        await request.app.state.manager.broadcast({
            "type": "device_update",
            "payload": {"devices": [{"id": device_id, "status": "normal"}]},
            "timestamp": datetime.now().isoformat(),
        })
        entry = request.app.state.audit.add(
            "device_control", device_id=device_id, device_name=dev.name,
            command="restart", result="success", message=f"{dev.name} 重啟完成",
        )
        await db.save_audit(
            entry_id=entry.id, timestamp=entry.timestamp, operation="device_control",
            actor=entry.actor, device_id=device_id, device_name=dev.name,
            command="restart", result="success", message=f"{dev.name} 重啟完成",
        )
        return {"ok": True, "id": device_id, "command": "restart",
                "message": f"{dev.name} 重啟完成"}

    dev.status = "offline"
    await request.app.state.manager.broadcast({
        "type": "device_update",
        "payload": {"devices": [{"id": device_id, "status": "offline"}]},
        "timestamp": datetime.now().isoformat(),
    })
    entry = request.app.state.audit.add(
        "device_control", device_id=device_id, device_name=dev.name,
        command="emergency_stop", result="success", message=f"{dev.name} 緊急停機完成",
    )
    await db.save_audit(
        entry_id=entry.id, timestamp=entry.timestamp, operation="device_control",
        actor=entry.actor, device_id=device_id, device_name=dev.name,
        command="emergency_stop", result="success", message=f"{dev.name} 緊急停機完成",
    )
    return {"ok": True, "id": device_id, "command": "emergency_stop",
            "message": f"{dev.name} 緊急停機完成"}


@router.get("/{device_id}/analytics")
async def get_device_analytics(
    device_id: str, request: Request, hours: int = 24,
    _auth: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    """設備指標統計分析（基於持久化歷史資料）"""
    dev = next((d for d in request.app.state.store.devices if d.id == device_id), None)
    if not dev:
        raise HTTPException(404, f"Device {device_id} not found")
    async with request.app.state.session_factory() as db_session:
        repo = DBRepository(db_session)
        result = await repo.get_device_analytics(device_id, hours)
    if not result:
        raise HTTPException(404, "尚無歷史資料，等待約 1 分鐘後再試")
    return result


@router.get("/{device_id}/history")
async def get_device_history(
    device_id: str, request: Request, hours: int = 24,
    _auth: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    dev = next((d for d in request.app.state.store.devices if d.id == device_id), None)
    if not dev:
        raise HTTPException(404, f"Device {device_id} not found")

    # 優先讀取 DB 歷史資料
    async with request.app.state.session_factory() as db_session:
        repo = DBRepository(db_session)
        db_rows = await repo.get_device_history(device_id, hours)

    if db_rows:
        return db_rows

    # Fallback：DB 尚無資料時回傳生成的模擬曲線
    now = datetime.now()
    base_power = max(abs(dev.current_power_kw), 1.0)
    has_temp   = dev.temperature is not None
    result = []
    for i in range(hours, -1, -1):
        t = now - timedelta(hours=i)
        h = t.hour
        load_mult = 0.65 + 0.4 * max(0, math.sin((h - 6) * math.pi / 12))
        power     = max(0, base_power * load_mult + random.uniform(
            -base_power * 0.06, base_power * 0.06))
        entry: dict = {"time": t.strftime("%H:%M"), "power_kw": round(power, 1)}
        if has_temp:
            base_t = dev.temperature  # type: ignore[assignment]
            entry["temperature"] = round(
                base_t * (0.9 + load_mult * 0.15) + random.uniform(-0.8, 0.8), 1)
        result.append(entry)
    return result
