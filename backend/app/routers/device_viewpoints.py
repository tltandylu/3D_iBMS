"""設備觀看視角路由 — /api/device-viewpoints

* GET    /api/device-viewpoints               全部設備自訂視角
* PUT    /api/device-viewpoints/{device_id}   設定單台設備視角（admin / operator）
* DELETE /api/device-viewpoints/{device_id}   清除自訂視角，回到預設視角（admin / operator）
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import require_roles
from app import device_viewpoints as store

router = APIRouter(prefix="/api/device-viewpoints", tags=["device-viewpoints"])


class ViewpointPayload(BaseModel):
    position: list[float] = Field(..., min_length=3, max_length=3)
    target: list[float] = Field(..., min_length=3, max_length=3)


@router.get("")
async def list_viewpoints(
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
) -> dict[str, Any]:
    return store.load_config()


@router.put("/{device_id}")
async def put_viewpoint(
    device_id: str,
    body: ViewpointPayload,
    user: dict = Depends(require_roles("admin", "operator")),
) -> dict[str, Any]:
    try:
        return store.save_viewpoint(
            device_id, body.position, body.target,
            updated_by=str(user.get("username") or user.get("name") or ""),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/{device_id}")
async def delete_viewpoint(
    device_id: str,
    _: dict = Depends(require_roles("admin", "operator")),
) -> dict[str, Any]:
    if not store.delete_viewpoint(device_id):
        raise HTTPException(404, f"{device_id} 沒有自訂視角")
    return {"ok": True, "device_id": device_id}
