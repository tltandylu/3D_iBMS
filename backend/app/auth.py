"""JWT 驗證工具 — python-jose + passlib/bcrypt"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt as _bcrypt
from jose import JWTError, jwt

from app.db.session import get_db
from app.db.repository import DBRepository

SECRET_KEY  = os.getenv("SECRET_KEY", "ibms-dev-secret-change-in-production")
ALGORITHM   = "HS256"
TOKEN_TTL_H = int(os.getenv("TOKEN_TTL_HOURS", "8"))

_bearer = HTTPBearer(auto_error=False)


# ── 密碼工具（直接使用 bcrypt，繞過 passlib 的 Python 3.14 相容問題）────

def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── Token 工具 ────────────────────────────────────────────────────────────

def create_access_token(username: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_H)
    return jwt.encode(
        {"sub": username, "role": role, "exp": exp},
        SECRET_KEY, algorithm=ALGORITHM,
    )

def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ── FastAPI 依賴 ──────────────────────────────────────────────────────────

async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: DBRepository = Depends(get_db),
):
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
    try:
        payload = decode_token(creds.credentials)
        username: str = payload.get("sub", "")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = await db.get_user(username)
    if not user or not user.get("is_active"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


def require_roles(*roles: str):
    """用法: Depends(require_roles('admin', 'operator'))"""
    async def _dep(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return current_user
    return _dep
