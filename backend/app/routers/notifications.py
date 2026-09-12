"""通知 API — Email 設定 + 站內信箱（Inbox）"""
from fastapi import APIRouter, Depends, Request
from app.auth import require_roles, get_current_user
from app.limiter import limiter
from app.db.session import get_db
from app.db.repository import DBRepository
from app import email_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/email-status")
async def email_status(_: dict = Depends(require_roles("admin", "operator", "viewer"))):
    """回傳 SMTP 是否已設定（不洩露憑證）"""
    return {
        "configured": email_service.is_configured(),
        "smtp_host":  email_service.SMTP_HOST or None,
        "smtp_port":  email_service.SMTP_PORT,
        "smtp_from":  email_service.SMTP_FROM or None,
        "recipients": email_service.get_recipients(),
    }


@router.post("/test-email")
@limiter.limit("3/minute")
async def test_email(
    request: Request,
    _: dict = Depends(require_roles("admin")),
):
    """發送測試郵件驗證 SMTP 設定（Admin only, 3次/分鐘）"""
    if not email_service.is_configured():
        return {"ok": False, "message": "SMTP 尚未設定（請檢查 SMTP_HOST / SMTP_USER / SMTP_TO）"}

    from datetime import datetime
    await email_service.send_alert_email(
        severity    = "CRITICAL",
        asset_name  = "測試設備 TEST-001",
        title       = "SMTP 設定測試郵件",
        description = "此為系統測試郵件，請確認收信正常。",
        occurred_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        alert_id    = "test-email-manual",
    )
    return {"ok": True, "message": f"測試郵件已送出至 {', '.join(email_service.get_recipients())}"}


# ── Inbox（站內通知）─────────────────────────────────────────────────────────

@router.get("/inbox")
async def list_inbox(
    db:          DBRepository = Depends(get_db),
    _:           dict         = Depends(require_roles("admin", "operator", "viewer")),
    limit:       int          = 50,
    unread_only: bool         = False,
):
    return await db.list_inbox_notifications(limit=limit, unread_only=unread_only)


@router.get("/inbox/unread-count")
async def inbox_unread_count(
    db: DBRepository = Depends(get_db),
    _:  dict         = Depends(require_roles("admin", "operator", "viewer")),
):
    return {"count": await db.inbox_unread_count()}


@router.patch("/inbox/{notif_id}/read")
async def mark_inbox_read(
    notif_id: str,
    db:       DBRepository = Depends(get_db),
    _:        dict         = Depends(require_roles("admin", "operator", "viewer")),
):
    await db.mark_inbox_read(notif_id)
    return {"ok": True}


@router.post("/inbox/read-all")
async def mark_inbox_all_read(
    db: DBRepository = Depends(get_db),
    _:  dict         = Depends(require_roles("admin", "operator", "viewer")),
):
    await db.mark_inbox_all_read()
    return {"ok": True}
