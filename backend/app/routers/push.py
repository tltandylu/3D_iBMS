"""Web Push 訂閱管理路由"""
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.auth import get_current_user
from app.db.session import get_db
from app.db.repository import DBRepository

router = APIRouter(prefix="/api/push", tags=["push"])


class SubscriptionKeys(BaseModel):
    p256dh: str
    auth:   str


class PushSubscriptionBody(BaseModel):
    endpoint: str
    keys:     SubscriptionKeys


@router.get("/vapid-key")
async def get_vapid_key(request: Request):
    return {"publicKey": getattr(request.app.state, "vapid_public_key", "")}


@router.post("/subscribe")
async def subscribe(
    body:         PushSubscriptionBody,
    request:      Request,
    db:           DBRepository = Depends(get_db),
    current_user: dict         = Depends(get_current_user),
):
    await db.save_push_subscription(
        username   = current_user["username"],
        endpoint   = body.endpoint,
        p256dh     = body.keys.p256dh,
        auth_key   = body.keys.auth,
        created_at = datetime.now().isoformat(),
    )
    return {"status": "subscribed"}


@router.delete("/unsubscribe")
async def unsubscribe(
    body: PushSubscriptionBody,
    db:   DBRepository = Depends(get_db),
    _:    dict         = Depends(get_current_user),
):
    await db.delete_push_subscription(body.endpoint)
    return {"status": "unsubscribed"}
