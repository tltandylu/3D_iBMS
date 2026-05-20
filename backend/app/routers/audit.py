from fastapi import APIRouter, Request
from typing import Optional

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
async def list_audit(request: Request, limit: int = 100, operation: Optional[str] = None):
    """回傳最近的操作稽核紀錄"""
    store = request.app.state.audit
    entries = store.recent(limit=limit, operation=operation or None)
    return [
        {
            "id":          e.id,
            "timestamp":   e.timestamp,
            "operation":   e.operation,
            "actor":       e.actor,
            "device_id":   e.device_id,
            "device_name": e.device_name,
            "command":     e.command,
            "result":      e.result,
            "message":     e.message,
        }
        for e in entries
    ]
