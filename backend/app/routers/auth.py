from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from app.auth import verify_password, create_access_token, get_current_user
from app.db.session import get_db
from app.db.repository import DBRepository
from app.limiter import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginBody, db: DBRepository = Depends(get_db)):
    user = await db.get_user(body.email)
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(401, "帳號或密碼錯誤")
    token = create_access_token(user["username"], user["role"])
    return {
        "access_token": token,
        "token_type":   "bearer",
        "user": {
            "id":           user["id"],
            "name":         user["name"],
            "email":        user["username"],
            "role":         user["role"],
            "avatarColor":  user["avatar_color"],
        },
    }


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {
        "id":          current_user["id"],
        "name":        current_user["name"],
        "email":       current_user["username"],
        "role":        current_user["role"],
        "avatarColor": current_user["avatar_color"],
    }
