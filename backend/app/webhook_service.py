"""後端 Webhook 告警推送服務（httpx 非同步）"""
import logging
from datetime import datetime, timedelta

import httpx

logger = logging.getLogger(__name__)

_SEV_RANK = {"CRITICAL": 3, "ALARM": 2, "WARNING": 1, "INFO": 0}

_SEV_COLOR = {
    "CRITICAL": "#ef4444",
    "ALARM":    "#f97316",
    "WARNING":  "#f59e0b",
    "INFO":     "#06b6d4",
}


def _build_payload(
    severity: str, asset_name: str, title: str,
    description: str, occurred_at: str, alert_id: str,
    floor: int, building_id: str,
) -> dict:
    color = _SEV_COLOR.get(severity, "#94a3b8")
    text  = f"【{severity}】{asset_name} — {title}"
    return {
        # 通用欄位
        "text":        text,
        "severity":    severity,
        "asset_name":  asset_name,
        "title":       title,
        "description": description,
        "occurred_at": occurred_at,
        "alert_id":    alert_id,
        "floor":       floor,
        "building_id": building_id,
        # Slack / Teams 相容 attachment
        "attachments": [{
            "color":  color,
            "title":  title,
            "text":   description,
            "footer": "AI-DT 智慧設施監控平台",
            "fields": [
                {"title": "設備",   "value": asset_name,  "short": True},
                {"title": "嚴重度", "value": severity,    "short": True},
                {"title": "樓層",   "value": str(floor),  "short": True},
                {"title": "時間",   "value": occurred_at, "short": True},
            ],
        }],
    }


async def try_send_webhook(
    *,
    severity:    str,
    asset_name:  str,
    title:       str,
    description: str,
    occurred_at: str,
    alert_id:    str,
    floor:       int,
    building_id: str,
    session_factory,
) -> None:
    from app.db.repository import DBRepository

    async with session_factory() as db_session:
        repo   = DBRepository(db_session)
        config = await repo.get_webhook_config()

    if not config or not config["enabled"] or not config["url"]:
        return

    # 嚴重度門檻檢查
    if _SEV_RANK.get(severity, 0) < _SEV_RANK.get(config["min_severity"], 0):
        return

    # 冷卻時間檢查
    last = config.get("last_triggered_at")
    if last:
        try:
            last_dt  = datetime.fromisoformat(last)
            cooldown = timedelta(minutes=config["cooldown_minutes"])
            if datetime.now() - last_dt < cooldown:
                logger.debug(f"[Webhook] 冷卻中，跳過 {alert_id}")
                return
        except ValueError:
            pass

    payload = _build_payload(
        severity, asset_name, title, description,
        occurred_at, alert_id, floor, building_id,
    )
    now_iso = datetime.now().isoformat()
    status  = "fail"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(config["url"], json=payload)
        status = "ok" if resp.is_success else "fail"
        logger.info(f"[Webhook] 推送 {alert_id} → {config['url']} 狀態 {resp.status_code}")
    except Exception as e:
        logger.warning(f"[Webhook] 推送失敗: {e}")

    async with session_factory() as db_session:
        repo = DBRepository(db_session)
        await repo.update_webhook_delivery(now_iso, status)
