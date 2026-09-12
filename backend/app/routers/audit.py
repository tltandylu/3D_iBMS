from fastapi import APIRouter, Request, Depends
from typing import Optional
from app.db.session import get_db
from app.db.repository import DBRepository
from app.auth import require_roles

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
async def list_audit(
    limit:     int           = 100,
    operation: Optional[str] = None,
    result:    Optional[str] = None,
    actor:     Optional[str] = None,
    db: DBRepository = Depends(get_db),
    _: dict          = Depends(require_roles("admin", "operator", "viewer")),
):
    logs = await db.get_audit_logs(limit=limit, operation=operation)
    if result:
        logs = [l for l in logs if l["result"] == result]
    if actor:
        logs = [l for l in logs if actor.lower() in l["actor"].lower()]
    return logs
