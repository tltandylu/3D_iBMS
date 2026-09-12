"""FastAPI 依賴注入：取得 DBRepository"""
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.engine import AsyncSessionLocal
from app.db.repository import DBRepository


async def get_db() -> AsyncGenerator[DBRepository, None]:
    async with AsyncSessionLocal() as session:
        yield DBRepository(session)
