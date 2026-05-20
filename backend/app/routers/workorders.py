from fastapi import APIRouter, HTTPException, Request
from app.models import WorkOrder
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/workorders", tags=["workorders"])


class CreateWOBody(BaseModel):
    id: Optional[str] = None
    wo_number: Optional[str] = None
    wo_type: str = "CM"
    title: str
    priority: str = "MEDIUM"
    asset_id: str
    asset_name: str
    assigned_to: Optional[str] = None
    estimated_hours: float = 2.0
    ai_root_cause: Optional[str] = None


@router.post("", response_model=WorkOrder)
async def create_workorder(body: CreateWOBody, request: Request):
    ts = int(datetime.now().timestamp() * 1000)
    new_wo = WorkOrder(
        id=body.id or f"wo-api-{ts}",
        wo_number=body.wo_number or f"WO-{ts % 1_000_000:06d}",
        wo_type=body.wo_type,  # type: ignore[arg-type]
        title=body.title,
        priority=body.priority,  # type: ignore[arg-type]
        status="pending",
        asset_id=body.asset_id,
        asset_name=body.asset_name,
        assigned_to=body.assigned_to or None,
        estimated_hours=body.estimated_hours,
        created_at=datetime.now().isoformat(),
        ai_root_cause=body.ai_root_cause or None,
    )
    request.app.state.store.work_orders.insert(0, new_wo)
    request.app.state.store.kpi.pending_work_orders += 1
    await request.app.state.manager.broadcast({
        "type": "workorder_new",
        "payload": new_wo.model_dump(),
        "timestamp": datetime.now().isoformat(),
    })
    return new_wo


@router.get("", response_model=list[WorkOrder])
async def list_workorders(request: Request, status: str | None = None):
    wos = request.app.state.store.work_orders
    if status:
        wos = [w for w in wos if w.status == status]
    return sorted(wos, key=lambda w: w.created_at, reverse=True)


@router.get("/{wo_id}", response_model=WorkOrder)
async def get_workorder(wo_id: str, request: Request):
    wo = next((w for w in request.app.state.store.work_orders if w.id == wo_id), None)
    if not wo:
        raise HTTPException(404, f"WorkOrder {wo_id} not found")
    return wo


@router.patch("/{wo_id}/status")
async def update_wo_status(wo_id: str, status: str, request: Request):
    wo = next((w for w in request.app.state.store.work_orders if w.id == wo_id), None)
    if not wo:
        raise HTTPException(404, f"WorkOrder {wo_id} not found")
    allowed = {"pending", "in_progress", "completed"}
    if status not in allowed:
        raise HTTPException(400, f"status must be one of {allowed}")
    old = wo.status
    wo.status = status  # type: ignore[assignment]
    kpi = request.app.state.store.kpi
    if old == "pending" and status == "in_progress":
        kpi.pending_work_orders = max(0, kpi.pending_work_orders - 1)
        kpi.in_progress_work_orders += 1
    elif old == "in_progress" and status == "completed":
        kpi.in_progress_work_orders = max(0, kpi.in_progress_work_orders - 1)
        kpi.today_completed_work_orders += 1
    await request.app.state.manager.broadcast({
        "type": "workorder_update",
        "payload": {"id": wo_id, "status": status},
        "timestamp": datetime.now().isoformat(),
    })
    return {"ok": True}
