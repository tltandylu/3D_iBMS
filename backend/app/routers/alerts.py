from fastapi import APIRouter, HTTPException, Request
from app.models import Alert
from datetime import datetime

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=list[Alert])
async def list_alerts(request: Request, status: str | None = None):
    alerts = request.app.state.store.alerts
    if status:
        alerts = [a for a in alerts if a.status == status]
    return sorted(alerts, key=lambda a: a.occurred_at, reverse=True)


@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, request: Request):
    alert = next((a for a in request.app.state.store.alerts if a.id == alert_id), None)
    if not alert:
        raise HTTPException(404, f"Alert {alert_id} not found")
    alert.status = "acknowledged"
    request.app.state.store.kpi.open_alerts = max(
        0, request.app.state.store.kpi.open_alerts - 1
    )
    await request.app.state.manager.broadcast({
        "type": "alert_update",
        "payload": {"id": alert_id, "status": "acknowledged"},
        "timestamp": datetime.now().isoformat(),
    })
    return {"ok": True}


@router.patch("/{alert_id}/resolve")
async def resolve_alert(alert_id: str, request: Request):
    alert = next((a for a in request.app.state.store.alerts if a.id == alert_id), None)
    if not alert:
        raise HTTPException(404, f"Alert {alert_id} not found")
    prev = alert.status
    alert.status = "resolved"
    if prev == "open":
        request.app.state.store.kpi.open_alerts = max(
            0, request.app.state.store.kpi.open_alerts - 1
        )
    await request.app.state.manager.broadcast({
        "type": "alert_update",
        "payload": {"id": alert_id, "status": "resolved"},
        "timestamp": datetime.now().isoformat(),
    })
    return {"ok": True}
