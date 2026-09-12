"""資料庫引擎工廠 — 支援 PostgreSQL (asyncpg) 與 MSSQL (aioodbc)"""
import os
import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost/ibms",
)

_is_pg   = "postgresql" in DATABASE_URL or "postgres" in DATABASE_URL
_is_mssql = "mssql" in DATABASE_URL
_label   = "PostgreSQL" if _is_pg else "MSSQL" if _is_mssql else "Unknown"

logger.info(f"[DB] Backend: {_label}  URL: ...{DATABASE_URL[-40:]}")

if not (_is_pg or _is_mssql):
    raise ValueError(
        f"DATABASE_URL 必須包含 'postgresql' 或 'mssql'，目前: {DATABASE_URL[:40]}"
    )

_engine_kwargs: dict = {"echo": False}
if _is_pg:
    _engine_kwargs.update({"pool_size": 5, "max_overflow": 10, "pool_pre_ping": True})
# MSSQL+aioodbc 不支援 pool_size 參數，保持預設

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)
