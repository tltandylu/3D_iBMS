"""排程報表設定 API"""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Literal

from app.auth import require_roles
from app.db.session import get_db
from app.db.repository import DBRepository
from app.limiter import limiter

router = APIRouter(prefix="/api/reports", tags=["reports"])


class ReportScheduleBody(BaseModel):
    enabled:    bool
    frequency:  Literal["daily", "weekly"] = "daily"
    weekday:    int  = 1   # 0=Mon … 6=Sun
    hour:       int  = 8   # 0-23
    recipients: str  = ""  # comma-separated; 空白 = 使用 SMTP_TO


@router.get("/schedule")
async def get_schedule(
    db: DBRepository = Depends(get_db),
    _:  dict         = Depends(require_roles("admin", "operator", "viewer")),
):
    cfg = await db.get_report_schedule()
    if not cfg:
        return {
            "enabled": False, "frequency": "daily", "weekday": 1,
            "hour": 8, "recipients": "",
            "last_sent_at": None, "last_status": None,
            "smtp_configured": False,
        }
    from app import email_service
    return {**cfg, "smtp_configured": email_service.is_configured()}


@router.put("/schedule")
async def update_schedule(
    body: ReportScheduleBody,
    db:   DBRepository = Depends(get_db),
    _:    dict         = Depends(require_roles("admin")),
):
    await db.upsert_report_schedule(
        enabled=body.enabled,
        frequency=body.frequency,
        weekday=max(0, min(6, body.weekday)),
        hour=max(0, min(23, body.hour)),
        recipients=body.recipients,
    )
    return {"message": "排程設定已儲存"}


@router.post("/send-now")
@limiter.limit("3/minute")
async def send_now(
    request: Request,
    db:      DBRepository = Depends(get_db),
    _:       dict         = Depends(require_roles("admin")),
):
    """立即發送一次報表（Admin，3次/分鐘）"""
    from app import email_service
    if not email_service.is_configured():
        return {"ok": False, "message": "SMTP 尚未設定，無法發送"}

    from app.report_service import send_report
    ok = await send_report(request.app.state.store, request.app.state.session_factory)
    if ok:
        return {"ok": True,  "message": "報表已成功發送"}
    return     {"ok": False, "message": "發送失敗，請確認 SMTP 設定"}
