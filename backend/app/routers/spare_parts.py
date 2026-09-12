"""備品庫存管理路由 — /api/spare-parts"""
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_roles
from app.db.session import get_db
from app.db.repository import DBRepository

router = APIRouter(prefix="/api/spare-parts", tags=["spare-parts"])

# ── Default seed data (first startup) ────────────────────────────────────
_SEED_PARTS = [
    {"part_number": "HVAC-001", "name": "空調濾網",       "category": "HVAC",     "unit": "片", "quantity": 25, "min_stock_level": 10, "unit_cost":   120, "location": "B1-A01", "supplier_name": "台灣空調供應商"},
    {"part_number": "HVAC-002", "name": "壓縮機冷媒 R410", "category": "HVAC",     "unit": "kg", "quantity":  5, "min_stock_level":  8, "unit_cost":   850, "location": "B1-A02", "supplier_name": "台灣空調供應商"},
    {"part_number": "HVAC-003", "name": "風扇馬達 1/2 HP","category": "HVAC",     "unit": "個", "quantity":  1, "min_stock_level":  2, "unit_cost":  3200, "location": "B1-A03", "supplier_name": "台灣空調供應商"},
    {"part_number": "PWR-001",  "name": "UPS 電池模組",   "category": "Power",    "unit": "組", "quantity":  3, "min_stock_level":  2, "unit_cost":  4500, "location": "B2-C01", "supplier_name": "台灣電力配件"},
    {"part_number": "PWR-002",  "name": "斷路器 30A",     "category": "Power",    "unit": "個", "quantity": 12, "min_stock_level":  5, "unit_cost":   280, "location": "B2-C02", "supplier_name": "台灣電力配件"},
    {"part_number": "PWR-003",  "name": "變壓器繞組",     "category": "Power",    "unit": "個", "quantity":  0, "min_stock_level":  1, "unit_cost": 12000, "location": "B2-C03", "supplier_name": "台灣電力配件"},
    {"part_number": "IT-001",   "name": "網路交換機模組", "category": "IT",       "unit": "個", "quantity":  2, "min_stock_level":  3, "unit_cost":  8500, "location": "B3-D01", "supplier_name": "科技配件商"},
    {"part_number": "IT-002",   "name": "SFP 光纖模組",  "category": "IT",       "unit": "個", "quantity":  8, "min_stock_level":  4, "unit_cost":  1200, "location": "B3-D02", "supplier_name": "科技配件商"},
    {"part_number": "FIRE-001", "name": "乾粉滅火藥劑",  "category": "Fire",     "unit": "kg", "quantity": 30, "min_stock_level": 15, "unit_cost":    95, "location": "B4-E01", "supplier_name": "消防器材商"},
    {"part_number": "SEC-001",  "name": "IP攝影機鏡頭",  "category": "Security", "unit": "個", "quantity":  4, "min_stock_level":  2, "unit_cost":  2800, "location": "B4-F01", "supplier_name": "安防設備商"},
]


async def seed_if_empty(db: DBRepository) -> None:
    if await db.spare_part_count() == 0:
        now = datetime.now().isoformat()
        for p in _SEED_PARTS:
            await db.upsert_spare_part({
                "id": str(uuid.uuid4()),
                "updated_at": now,
                **p,
            })


# ── Pydantic schemas ──────────────────────────────────────────────────────

class PartCreate(BaseModel):
    part_number: str
    name: str
    description: str = ""
    category: str = "General"
    unit: str = "個"
    quantity: int = 0
    min_stock_level: int = 1
    unit_cost: float = 0.0
    location: str = ""
    supplier_name: str = ""


class PartUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    unit: str | None = None
    quantity: int | None = None
    min_stock_level: int | None = None
    unit_cost: float | None = None
    location: str | None = None
    supplier_name: str | None = None


class QuantityAdjust(BaseModel):
    delta: int   # positive = receive, negative = consume


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("")
async def list_parts(
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    await seed_if_empty(db)
    return await db.list_spare_parts()


@router.get("/low-stock")
async def low_stock(
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    """回傳庫存低於最低水位或缺貨的備品"""
    parts = await db.list_spare_parts()
    return [p for p in parts if p["stock_status"] in ("out", "low")]


@router.post("", status_code=201)
async def create_part(
    body: PartCreate,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator")),
):
    part_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    await db.upsert_spare_part({
        "id": part_id,
        "updated_at": now,
        **body.model_dump(),
    })
    return {"id": part_id}


@router.patch("/{part_id}")
async def update_part(
    part_id: str,
    body: PartUpdate,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator")),
):
    existing = await db.get_spare_part(part_id)
    if not existing:
        raise HTTPException(404, "Part not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    merged = {**existing, **updates, "updated_at": datetime.now().isoformat()}
    await db.upsert_spare_part(merged)
    return {"ok": True}


@router.post("/{part_id}/adjust")
async def adjust_quantity(
    part_id: str,
    body: QuantityAdjust,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator")),
):
    """入庫（delta>0）或出庫/消耗（delta<0）"""
    await db.update_spare_part_quantity(part_id, body.delta, datetime.now().isoformat())
    return {"ok": True}


@router.delete("/{part_id}", status_code=204)
async def delete_part(
    part_id: str,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator")),
):
    await db.delete_spare_part(part_id)
