from fastapi import APIRouter, Request
from app.models import KPIData
import random
from datetime import datetime, timedelta

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
