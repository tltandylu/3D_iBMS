"""使用者管理 REST API（Admin CRUD + 自改密碼 + 個人偏好設定）"""
import uuid
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from app.auth import hash_password, verify_password, require_roles, get_current_user
from app.db.session import get_db
from app.db.repository import DBRepository
from app.limiter import limiter

router = APIRouter(prefix="/api/users", tags=["users"])

_VALID_ROLES  = {"admin", "operator", "viewer"}
_VALID_COLORS = {"#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ec4899"}


class CreateUserBody(BaseModel):
    username:     str
    name:         str
    password:     str
    role:         str = "viewer"
    avatar_color: str = "#06b6d4"


class UpdateUserBody(BaseModel):
    name:         str | None = None
    role:         str | None = None
    avatar_color: str | None = None
    is_active:    bool | None = None


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password:     str


class AdminResetPasswordBody(BaseModel):
    new_password: str


class PreferenceBody(BaseModel):
    data: dict


# ── 個人偏好設定（必須放在 /{user_id} 之前，避免路由衝突）─────────────────────

@router.get("/me/preferences")
async def get_preferences(
    db:           DBRepository = Depends(get_db),
    current_user: dict         = Depends(get_current_user),
):
    pref = await db.get_user_pref(current_user["id"])
    return pref["data"] if pref else {}


@router.put("/me/preferences")
async def update_preferences(
    body:         PreferenceBody,
    db:           DBRepository = Depends(get_db),
    current_user: dict         = Depends(get_current_user),
):
    await db.upsert_user_pref(
        user_id=current_user["id"],
        data=json.dumps(body.data, ensure_ascii=False),
        updated_at=datetime.now().isoformat(),
    )
    return {"message": "偏好設定已儲存"}


# ── Admin: 列表 ─────────────────────────────────────────────────────────────

@router.get("")
async def list_users(
    db: DBRepository = Depends(get_db),
    _:  dict         = Depends(require_roles("admin")),
):
    return await db.list_users()


# ── Admin: 新增 ─────────────────────────────────────────────────────────────

@router.post("", status_code=201)
@limiter.limit("20/minute")
async def create_user(
    request: Request,
    body: CreateUserBody,
    db:   DBRepository = Depends(get_db),
    _:    dict         = Depends(require_roles("admin")),
):
    if body.role not in _VALID_ROLES:
        raise HTTPException(400, f"無效角色，允許: {', '.join(_VALID_ROLES)}")
    if await db.get_user(body.username):
        raise HTTPException(409, "帳號已存在")
    if len(body.password) < 6:
        raise HTTPException(400, "密碼至少需 6 個字元")
    user_id = str(uuid.uuid4())[:8]
    await db.create_user(
        user_id=user_id, username=body.username, name=body.name,
        hashed_password=hash_password(body.password), role=body.role,
        avatar_color=body.avatar_color, created_at=datetime.now().isoformat(),
    )
    return {"id": user_id, "message": "使用者已建立"}


# ── 自改密碼（必須放在 /{user_id} 之前，避免路由衝突）────────────────────────

@router.patch("/me/password")
async def change_own_password(
    body:         ChangePasswordBody,
    db:           DBRepository = Depends(get_db),
    current_user: dict         = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user["hashed_password"]):
        raise HTTPException(400, "目前密碼錯誤")
    if len(body.new_password) < 6:
        raise HTTPException(400, "新密碼至少需 6 個字元")
    await db.update_user_password(current_user["id"], hash_password(body.new_password))
    return {"message": "密碼已更新"}


# ── Admin: 更新 ─────────────────────────────────────────────────────────────

@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    body:    UpdateUserBody,
    db:      DBRepository = Depends(get_db),
    _:       dict         = Depends(require_roles("admin")),
):
    updates = body.model_dump(exclude_none=True)
    if "role" in updates and updates["role"] not in _VALID_ROLES:
        raise HTTPException(400, f"無效角色")
    if updates:
        await db.update_user(user_id, updates)
    return {"message": "已更新"}


# ── Admin: 重設密碼 ─────────────────────────────────────────────────────────

@router.patch("/{user_id}/reset-password")
async def admin_reset_password(
    user_id: str,
    body:    AdminResetPasswordBody,
    db:      DBRepository = Depends(get_db),
    _:       dict         = Depends(require_roles("admin")),
):
    if len(body.new_password) < 6:
        raise HTTPException(400, "密碼至少需 6 個字元")
    await db.update_user_password(user_id, hash_password(body.new_password))
    return {"message": "密碼已重設"}


# ── Admin: 停用/啟用 ────────────────────────────────────────────────────────

@router.delete("/{user_id}")
async def deactivate_user(
    user_id:      str,
    db:           DBRepository = Depends(get_db),
    current_user: dict         = Depends(require_roles("admin")),
):
    if current_user["id"] == user_id:
        raise HTTPException(400, "無法停用自己的帳號")
    await db.update_user(user_id, {"is_active": False})
    return {"message": "帳號已停用"}
