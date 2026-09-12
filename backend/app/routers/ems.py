from fastapi import APIRouter, Request, Depends
from app.models import KPIData
from app.auth import require_roles
from app.db.session import get_db
from app.db.repository import DBRepository
import random
from datetime import datetime, timedelta

# 台灣電力排放係數 2023（kgCO2e/kWh），來源：環境部
_EMISSION_FACTOR = 0.502

router = APIRouter(prefix="/api/ems", tags=["ems"])


@router.get("/kpi", response_model=KPIData)
async def get_kpi(request: Request):
    return request.app.state.store.kpi


@router.get("/energy-trend")
async def get_energy_trend(request: Request, points: int = 48):
    """回傳 N 個 15 分鐘間距的需量歷史趨勢"""
    now = datetime.now()
    result = []
    base = 680
    for i in range(points, -1, -1):
        t = now - timedelta(minutes=i * 15)
        h = t.hour
        peak_mult = 1.0 if 9 <= h <= 18 else 0.6
        demand   = max(300, base * peak_mult + random.uniform(-40, 40))
        baseline = base * peak_mult * 0.95
        result.append({
            "time": t.strftime("%H:%M"),
            "demand":   round(demand),
            "baseline": round(baseline),
            "forecast": round(demand * 1.02) if i <= 3 else None,
        })
    return result


@router.get("/oee-history")
async def get_oee_history(request: Request, days: int = 7, db: DBRepository = Depends(get_db)):
    """過去 N 天的每日 OEE 統計（聚合自 device_metrics）"""
    return await db.get_oee_history(days)


@router.get("/daily-energy")
async def get_daily_energy(request: Request, days: int = 30, db: DBRepository = Depends(get_db)):
    """過去 N 天的每日用電統計（聚合自 device_metrics）"""
    return await db.get_daily_energy(days)


@router.get("/carbon")
async def get_carbon_data(
    months: int = 13,
    db:     DBRepository = Depends(get_db),
    _:      dict         = Depends(require_roles("admin", "operator", "viewer")),
):
    """過去 N 個月碳排放統計（月度 kWh × 排放係數）"""
    monthly = await db.get_monthly_energy(months=months)
    return [
        {
            "month":   row["month"],
            "kwh":     row["total_kwh"],
            "tco2e":   round(row["total_kwh"] * _EMISSION_FACTOR / 1000, 3),
            "peak_kw": row["peak_kw"],
        }
        for row in monthly
    ]


@router.get("/predictive-maintenance")
async def get_predictive_maintenance(
    request: Request,
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    """AI 預測維護排程：依 RUL + AI 異常分計算每台設備預計維護日期"""
    devices = request.app.state.store.devices
    now = datetime.now()
    predictions = []

    for d in devices:
        if d.status == "offline":
            continue
        ai = d.ai_score or 0.0
        # AI 異常分高 → 加速劣化，縮短 RUL（最多縮 35%）
        adjusted_rul = max(1, round(d.rul_days * max(0.65, 1 - ai * 0.35)))

        if adjusted_rul <= 7 or d.status == "critical":
            urgency = "IMMEDIATE"
        elif adjusted_rul <= 30:
            urgency = "HIGH"
        elif adjusted_rul <= 90:
            urgency = "MEDIUM"
        else:
            urgency = "LOW"

        predictions.append({
            "device_id":       d.id,
            "asset_code":      d.asset_code,
            "name":            d.name,
            "category":        d.category,
            "criticality":     d.criticality,
            "status":          d.status,
            "rul_days":        d.rul_days,
            "adjusted_rul":    adjusted_rul,
            "predicted_date":  (now + timedelta(days=adjusted_rul)).strftime("%Y-%m-%d"),
            "urgency":         urgency,
            "ai_score_pct":    round(ai * 100),
            "temperature":     d.temperature,
            "current_power_kw": d.current_power_kw,
        })

    return sorted(predictions, key=lambda x: x["adjusted_rul"])


@router.get("/demand-shed-plan")
async def demand_shed_plan(request: Request):
    """AI 建議的需量卸載計畫"""
    devices = request.app.state.store.devices
    kpi     = request.app.state.store.kpi
    ratio   = kpi.demand_ratio_pct

    if ratio < 80:
        return {"status": "safe", "message": "需量使用率正常，無需卸載", "candidates": []}

    candidates = [
        {
            "device_id": d.id,
            "asset_code": d.asset_code,
            "name": d.name,
            "estimated_reduction_kw": round(d.current_power_kw * 0.6, 1),
            "priority": i + 1,
        }
        for i, d in enumerate(
            sorted(
                [d for d in devices if d.category == "HVAC" and d.status == "normal"],
                key=lambda d: d.current_power_kw,
                reverse=True,
            )[:3]
        )
    ]
    total_reduction = sum(c["estimated_reduction_kw"] for c in candidates)
    return {
        "status": "warning" if ratio < 95 else "critical",
        "current_ratio_pct": ratio,
        "estimated_reduction_kw": total_reduction,
        "new_ratio_pct": round((kpi.demand_kw - total_reduction) / kpi.contract_demand_kw * 100, 1),
        "candidates": candidates,
    }
