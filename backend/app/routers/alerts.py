from fastapi import APIRouter, HTTPException, Request, Depends
from app.models import Alert
from app.db.session import get_db
from app.db.repository import DBRepository
from app.auth import require_roles
from datetime import datetime

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("/analytics")
async def alert_analytics(
    request: Request,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    """告警智能分析 — 從記憶體 store + DB 彙總統計"""
    # 優先取 DB 歷史（最多 500 筆），補以記憶體 store（含 SIM 模式）
    db_alerts = await db.get_alerts(limit=500)
    store_alerts = request.app.state.store.alerts
    # 合併去重
    seen: set[str] = set()
    combined = []
    for a in list(db_alerts) + list(store_alerts):
        if a.id not in seen:
            seen.add(a.id)
            combined.append(a)

    total = len(combined)
    by_severity: dict[str, int] = {}
    by_status:   dict[str, int] = {}
    by_hour:     dict[int, int]  = {h: 0 for h in range(24)}
    device_counts: dict[str, int] = {}

    for a in combined:
        by_severity[a.severity] = by_severity.get(a.severity, 0) + 1
        by_status[a.status]     = by_status.get(a.status, 0) + 1
        try:
            by_hour[int(a.occurred_at[11:13])] += 1
        except Exception:
            pass
        device_counts[a.asset_name] = device_counts.get(a.asset_name, 0) + 1

    top_devices = sorted(device_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    critical_cnt  = by_severity.get("CRITICAL", 0)
    open_cnt      = by_status.get("open", 0)
    resolved_cnt  = by_status.get("resolved", 0)
    resolution_rate = round(resolved_cnt / max(1, total) * 100, 1)

    # 連續告警設備（>= 3 筆 open 告警）— 需要特別關注
    repeat_offenders = [
        {"name": n, "count": c}
        for n, c in device_counts.items()
        if c >= 3
    ][:5]

    return {
        "total":             total,
        "open":              open_cnt,
        "critical_count":    critical_cnt,
        "critical_rate_pct": round(critical_cnt / max(1, total) * 100, 1),
        "resolution_rate_pct": resolution_rate,
        "by_severity":  by_severity,
        "by_status":    by_status,
        "by_hour":      {str(h): v for h, v in by_hour.items()},
        "top_devices":  [{"name": n, "count": c} for n, c in top_devices],
        "repeat_offenders": repeat_offenders,
    }


@router.get("", response_model=list[Alert])
async def list_alerts(request: Request, status: str | None = None):
    alerts = request.app.state.store.alerts
    if status:
        alerts = [a for a in alerts if a.status == status]
    return sorted(alerts, key=lambda a: a.occurred_at, reverse=True)


@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str, request: Request,
    db: DBRepository = Depends(get_db),
    _auth: dict = Depends(require_roles("admin", "operator")),
):
    alert = next((a for a in request.app.state.store.alerts if a.id == alert_id), None)
    if not alert:
        raise HTTPException(404, f"Alert {alert_id} not found")
    alert.status = "acknowledged"
    request.app.state.store.kpi.open_alerts = max(
        0, request.app.state.store.kpi.open_alerts - 1
    )
    await db.update_alert_status(alert_id, "acknowledged")
    await request.app.state.manager.broadcast({
        "type": "alert_update",
        "payload": {"id": alert_id, "status": "acknowledged"},
        "timestamp": datetime.now().isoformat(),
    })
    return {"ok": True}


@router.patch("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str, request: Request,
    db: DBRepository = Depends(get_db),
    _auth: dict = Depends(require_roles("admin", "operator")),
):
    alert = next((a for a in request.app.state.store.alerts if a.id == alert_id), None)
    if not alert:
        raise HTTPException(404, f"Alert {alert_id} not found")
    prev = alert.status
    alert.status = "resolved"
    if prev == "open":
        request.app.state.store.kpi.open_alerts = max(
            0, request.app.state.store.kpi.open_alerts - 1
        )
    await db.update_alert_status(alert_id, "resolved")
    await request.app.state.manager.broadcast({
        "type": "alert_update",
        "payload": {"id": alert_id, "status": "resolved"},
        "timestamp": datetime.now().isoformat(),
    })
    return {"ok": True}
