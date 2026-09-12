"""巡檢管理路由 — /api/inspections"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_roles
from app.db.session import get_db
from app.db.repository import DBRepository

router = APIRouter(prefix="/api/inspections", tags=["inspections"])


# ── Pydantic schemas ──────────────────────────────────────────────────────

class RouteCreate(BaseModel):
    name: str
    description: str = ""
    device_ids: list[str]
    frequency: str = "daily"   # daily | weekly | monthly | as_needed


class FindingItem(BaseModel):
    device_id: str
    device_name: str
    result: str                # pass | fail | skip
    reading: str = ""
    notes: str = ""


class RecordCreate(BaseModel):
    route_id: str
    route_name: str
    inspector_name: str
    findings: list[FindingItem]
    overall_result: str        # pass | fail | partial


# ── Routes ────────────────────────────────────────────────────────────────

@router.get("/routes")
async def list_routes(
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    """列出所有巡檢路線"""
    return await db.list_inspection_routes()


@router.post("/routes", status_code=201)
async def create_route(
    body: RouteCreate,
    db: DBRepository = Depends(get_db),
    actor: dict = Depends(require_roles("admin", "operator")),
):
    """新增巡檢路線"""
    route_id = f"rt-{int(datetime.now().timestamp()*1000)}"
    await db.create_inspection_route(
        route_id=route_id,
        name=body.name,
        description=body.description,
        device_ids=json.dumps(body.device_ids),
        frequency=body.frequency,
        created_by=actor.get("sub", ""),
        created_at=datetime.now().isoformat(),
    )
    return {"id": route_id, "name": body.name}


@router.delete("/routes/{route_id}", status_code=204)
async def delete_route(
    route_id: str,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator")),
):
    """刪除巡檢路線"""
    await db.delete_inspection_route(route_id)


@router.get("/records")
async def list_records(
    limit: int = 30,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    """最近 N 筆巡檢記錄"""
    return await db.list_inspection_records(limit=limit)


@router.post("/records", status_code=201)
async def create_record(
    body: RecordCreate,
    db: DBRepository = Depends(get_db),
    actor: dict = Depends(require_roles("admin", "operator")),
):
    """提交巡檢結果"""
    record_id = f"rec-{int(datetime.now().timestamp()*1000)}"
    now = datetime.now().isoformat()
    await db.create_inspection_record(
        record_id=record_id,
        route_id=body.route_id,
        route_name=body.route_name,
        inspector_name=body.inspector_name,
        started_at=now,
        findings=json.dumps([f.model_dump() for f in body.findings]),
        status="completed",
        completed_at=now,
        overall_result=body.overall_result,
    )
    return {"id": record_id, "overall_result": body.overall_result}
