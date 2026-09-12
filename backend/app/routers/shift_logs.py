"""值班日誌 API"""
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from app.auth import require_roles, get_current_user
from app.db.session import get_db
from app.db.repository import DBRepository

router = APIRouter(prefix="/api/shift-logs", tags=["shift-logs"])

_VALID_SHIFT_TYPES = {"morning", "afternoon", "night"}
_SHIFT_LABELS = {"morning": "早班", "afternoon": "晚班", "night": "夜班"}


class CreateShiftBody(BaseModel):
    shift_type:      str
    summary:         str = ""
    device_snapshot: dict | None = None


class CloseShiftBody(BaseModel):
    handover_notes: str = ""
    summary:        str = ""


class IncidentBody(BaseModel):
    severity:    str = "WARNING"   # INFO | WARNING | ALARM | CRITICAL
    description: str
    device_id:   str | None = None
    device_name: str | None = None


# ── 查詢 ─────────────────────────────────────────────────────────────────────

@router.get("")
async def list_shift_logs(
    db:    DBRepository = Depends(get_db),
    _:     dict         = Depends(require_roles("admin", "operator", "viewer")),
    limit: int          = 20,
):
    return await db.list_shift_logs(limit=min(limit, 50))


@router.get("/active")
async def get_active_shift(
    db: DBRepository = Depends(get_db),
    _:  dict         = Depends(require_roles("admin", "operator", "viewer")),
):
    shift = await db.get_active_shift()
    return shift or {}


@router.get("/{log_id}")
async def get_shift_log(
    log_id: str,
    db:     DBRepository = Depends(get_db),
    _:      dict         = Depends(require_roles("admin", "operator", "viewer")),
):
    shift = await db.get_shift_log(log_id)
    if not shift:
        raise HTTPException(404, "日誌不存在")
    return shift


# ── 建立 ─────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_shift_log(
    body:         CreateShiftBody,
    db:           DBRepository = Depends(get_db),
    current_user: dict         = Depends(require_roles("admin", "operator")),
):
    if body.shift_type not in _VALID_SHIFT_TYPES:
        raise HTTPException(400, f"shift_type 必須為 {_VALID_SHIFT_TYPES}")
    # 若已有未關閉班次，不允許再開
    active = await db.get_active_shift()
    if active:
        raise HTTPException(409, f"目前有未關閉的班次（{active['operator_name']} / {_SHIFT_LABELS.get(active['shift_type'], active['shift_type'])}），請先關閉後再開始新班次")

    now     = datetime.now().isoformat()
    log_id  = f"sl-{uuid.uuid4().hex[:10]}"
    snap    = json.dumps(body.device_snapshot, ensure_ascii=False) if body.device_snapshot else None
    await db.create_shift_log(
        log_id=log_id, shift_type=body.shift_type,
        operator_name=current_user.get("name", current_user.get("username", "操作員")),
        start_time=now, summary=body.summary,
        device_snapshot=snap, created_at=now,
    )
    return {"id": log_id, "message": f"{_SHIFT_LABELS[body.shift_type]}班次已開始"}


# ── 關閉班次 ─────────────────────────────────────────────────────────────────

@router.patch("/{log_id}/close")
async def close_shift_log(
    log_id: str,
    body:   CloseShiftBody,
    db:     DBRepository = Depends(get_db),
    _:      dict         = Depends(require_roles("admin", "operator")),
):
    shift = await db.get_shift_log(log_id)
    if not shift:
        raise HTTPException(404, "日誌不存在")
    if shift["is_closed"]:
        raise HTTPException(400, "班次已關閉")
    end_time = datetime.now().isoformat()
    await db.close_shift_log(
        log_id=log_id, end_time=end_time,
        handover_notes=body.handover_notes,
        summary=body.summary or shift["summary"],
    )
    return {"ok": True, "end_time": end_time}


# ── 新增事件 ─────────────────────────────────────────────────────────────────

@router.post("/{log_id}/incidents")
async def add_incident(
    log_id: str,
    body:   IncidentBody,
    db:     DBRepository = Depends(get_db),
    _:      dict         = Depends(require_roles("admin", "operator")),
):
    shift = await db.get_shift_log(log_id)
    if not shift:
        raise HTTPException(404, "日誌不存在")
    if shift["is_closed"]:
        raise HTTPException(400, "班次已關閉，無法新增事件")
    incidents = shift["incidents"] or []
    incidents.append({
        "id":          f"inc-{uuid.uuid4().hex[:8]}",
        "time":        datetime.now().isoformat(),
        "severity":    body.severity,
        "description": body.description,
        "device_id":   body.device_id,
        "device_name": body.device_name,
    })
    await db.add_shift_incident(log_id, json.dumps(incidents, ensure_ascii=False))
    return {"ok": True, "incident_count": len(incidents)}
