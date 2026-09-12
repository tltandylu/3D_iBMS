"""CSV 資料匯出 API（StreamingResponse）"""
import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.auth import require_roles
from app.db.session import get_db
from app.db.repository import DBRepository

router = APIRouter(prefix="/api/export", tags=["export"])

_CSV_HEADERS = {"Content-Disposition": "attachment"}


def _csv_response(filename: str, rows: list[list[str]], headers: list[str]) -> StreamingResponse:
    buf = io.StringIO()
    w   = csv.writer(buf)
    w.writerow(headers)
    w.writerows(rows)
    buf.seek(0)
    encoded = buf.getvalue().encode("utf-8-sig")   # utf-8-sig → Excel 可直接開啟中文
    return StreamingResponse(
        iter([encoded]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── 設備清單 ──────────────────────────────────────────────────────────────────

@router.get("/devices")
async def export_devices(
    request: Request,
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    devices = request.app.state.store.devices
    now     = datetime.now().strftime("%Y%m%d_%H%M%S")
    headers = ["設備ID", "資產碼", "名稱", "類別", "型號", "狀態",
               "功率(kW)", "溫度(°C)", "AI風險分數", "樓層", "棟別",
               "製造商", "安裝日", "保固到期", "預估剩餘壽命(天)", "重要性"]
    rows = []
    for d in devices:
        rows.append([
            d.id, d.asset_code, d.name, d.category, d.asset_type or "",
            d.status, str(round(d.current_power_kw, 2)),
            str(round(d.temperature, 1)) if d.temperature is not None else "",
            str(round(d.ai_score, 3))    if d.ai_score    is not None else "",
            str(d.floor), d.building_id,
            d.manufacturer or "", d.install_date or "",
            d.warranty_expiry or "",
            str(d.rul_days) if d.rul_days is not None else "",
            d.criticality or "",
        ])
    return _csv_response(f"devices_{now}.csv", rows, headers)


# ── 告警歷史 ──────────────────────────────────────────────────────────────────

@router.get("/alerts")
async def export_alerts(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 500,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    alerts = await db.get_alerts(status=status, limit=limit)
    now    = datetime.now().strftime("%Y%m%d_%H%M%S")
    headers = ["告警ID", "設備ID", "設備名稱", "標題", "描述",
               "嚴重度", "狀態", "發生時間", "樓層", "棟別", "AI根因"]
    rows = []
    for a in alerts:
        if severity and a.severity != severity:
            continue
        rows.append([
            a.id, a.asset_id, a.asset_name, a.title, a.description or "",
            a.severity, a.status, a.occurred_at,
            str(a.floor), a.building_id, a.ai_root_cause or "",
        ])
    return _csv_response(f"alerts_{now}.csv", rows, headers)


# ── 稽核日誌 ──────────────────────────────────────────────────────────────────

@router.get("/audit")
async def export_audit(
    operation: Optional[str] = None,
    result:    Optional[str] = None,
    limit:     int           = 500,
    db: DBRepository = Depends(get_db),
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    logs = await db.get_audit_logs(limit=limit, operation=operation)
    if result:
        logs = [l for l in logs if l["result"] == result]
    now = datetime.now().strftime("%Y%m%d_%H%M%S")
    headers = ["記錄ID", "時間", "操作類型", "操作者", "設備ID", "設備名稱", "指令", "結果", "訊息"]
    rows = [[
        l["id"], l["timestamp"], l["operation"], l["actor"],
        l["device_id"], l["device_name"], l["command"], l["result"], l["message"],
    ] for l in logs]
    return _csv_response(f"audit_{now}.csv", rows, headers)


# ── KPI 快照 ──────────────────────────────────────────────────────────────────

@router.get("/kpi")
async def export_kpi(
    request: Request,
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
):
    kpi = request.app.state.store.kpi
    now = datetime.now().strftime("%Y%m%d_%H%M%S")
    headers = ["指標", "數值", "單位"]
    rows = [
        ["總設備數",         str(kpi.total_devices),              "台"],
        ["正常設備",         str(kpi.online_devices),             "台"],
        ["警示設備",         str(kpi.warning_devices),            "台"],
        ["嚴重設備",         str(kpi.critical_devices),           "台"],
        ["離線設備",         str(kpi.offline_devices),            "台"],
        ["總用電功率",       str(round(kpi.total_power_kw, 1)),   "kW"],
        ["即時需量",         str(round(kpi.demand_kw, 1)),        "kW"],
        ["契約容量",         str(kpi.contract_demand_kw),         "kW"],
        ["需量使用率",       str(round(kpi.demand_ratio_pct, 1)), "%"],
        ["今日用電量",       str(round(kpi.today_kwh, 1)),        "kWh"],
        ["未處理告警",       str(kpi.open_alerts),                "件"],
        ["待處理工單",       str(kpi.pending_work_orders),        "件"],
        ["處理中工單",       str(kpi.in_progress_work_orders),    "件"],
        ["今日完成工單",     str(kpi.today_completed_work_orders),"件"],
        ["平均修復時間MTTR", str(round(kpi.mttr_hours, 1)),       "h"],
        ["平均故障間隔MTBF", str(round(kpi.mtbf_days, 1)),        "天"],
        ["設備可用率",       str(round(kpi.availability_pct, 1)), "%"],
        ["匯出時間",         datetime.now().strftime("%Y-%m-%d %H:%M:%S"), ""],
    ]
    return _csv_response(f"kpi_{now}.csv", rows, headers)
