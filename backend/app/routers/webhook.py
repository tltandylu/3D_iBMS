"""Webhook 設定管理 API"""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Literal

from app.auth import require_roles
from app.db.session import get_db
from app.db.repository import DBRepository
from app.limiter import limiter

router = APIRouter(prefix="/api/webhook", tags=["webhook"])

_VALID_SEV = {"CRITICAL", "ALARM", "WARNING"}


class WebhookConfigBody(BaseModel):
    enabled:          bool
    url:              str
    min_severity:     Literal["CRITICAL", "ALARM", "WARNING"] = "CRITICAL"
    cooldown_minutes: int = 5


@router.get("/config")
async def get_config(
    db: DBRepository = Depends(get_db),
    _:  dict         = Depends(require_roles("admin", "operator", "viewer")),
):
    cfg = await db.get_webhook_config()
    if not cfg:
        return {
            "enabled": False, "url": "", "min_severity": "CRITICAL",
            "cooldown_minutes": 5, "last_triggered_at": None, "last_status": None,
        }
    return cfg


@router.put("/config")
async def update_config(
    body: WebhookConfigBody,
    db:   DBRepository = Depends(get_db),
    _:    dict         = Depends(require_roles("admin")),
):
    await db.upsert_webhook_config(
        enabled=body.enabled,
        url=body.url,
        min_severity=body.min_severity,
        cooldown_minutes=max(1, body.cooldown_minutes),
    )
    return {"message": "Webhook 設定已儲存"}


@router.post("/test")
@limiter.limit("5/minute")
async def test_webhook(
    request: Request,
    db:      DBRepository = Depends(get_db),
    _:       dict         = Depends(require_roles("admin")),
):
    cfg = await db.get_webhook_config()
    if not cfg or not cfg["url"]:
        return {"ok": False, "message": "請先設定並儲存 Webhook URL"}

    from datetime import datetime
    from app.webhook_service import _build_payload
    import httpx

    payload = _build_payload(
        severity    = "CRITICAL",
        asset_name  = "測試設備 TEST-001",
        title       = "Webhook 設定測試訊息",
        description = "此為系統測試推送，請確認 Webhook 端點收到此訊息。",
        occurred_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        alert_id    = "test-webhook-manual",
        floor       = 1,
        building_id = "B1",
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(cfg["url"], json=payload)
        status = "ok" if resp.is_success else "fail"
        await db.update_webhook_delivery(datetime.now().isoformat(), status)
        if resp.is_success:
            return {"ok": True,  "message": f"測試推送成功（HTTP {resp.status_code}）"}
        return     {"ok": False, "message": f"端點回傳 HTTP {resp.status_code}"}
    except Exception as e:
        return {"ok": False, "message": f"連線失敗: {e}"}
