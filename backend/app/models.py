from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime


DeviceStatus   = Literal['normal', 'warning', 'critical', 'offline']
AlertSeverity  = Literal['INFO', 'WARNING', 'ALARM', 'CRITICAL']
WorkOrderType  = Literal['PM', 'CM', 'EM']
WorkOrderStatus = Literal['pending', 'in_progress', 'completed']


class BimLocation(BaseModel):
    x: float
    y: float
    z: float


class Device(BaseModel):
    id: str
    asset_code: str
    name: str
    category: str
    asset_type: str
    status: DeviceStatus
    current_power_kw: float
    floor: int
    building_id: str
    position: List[float]          # [x, y, z] 場景座標
    bim_location: BimLocation
    manufacturer: str
    model: str
    install_date: str
    warranty_expiry: str
    rul_days: int
    criticality: str
    temperature: Optional[float] = None
    ai_score: Optional[float] = None


class Alert(BaseModel):
    id: str
    asset_id: str
    asset_name: str
    title: str
    description: str
    severity: AlertSeverity
    status: Literal['open', 'acknowledged', 'resolved']
    occurred_at: str
    ai_root_cause: Optional[str] = None
    ai_action_suggestion: Optional[str] = None
    floor: int
    building_id: str


class WorkOrder(BaseModel):
    id: str
    wo_number: str
    wo_type: WorkOrderType
    title: str
    priority: str
    status: WorkOrderStatus
    asset_id: str
    asset_name: str
    assigned_to: Optional[str] = None
    estimated_hours: float
    actual_hours: Optional[float] = None
    created_at: str
    ai_root_cause: Optional[str] = None


class KPIData(BaseModel):
    total_devices: int
    online_devices: int
    warning_devices: int
    critical_devices: int
    offline_devices: int
    total_power_kw: float
    demand_kw: float
    contract_demand_kw: float
    demand_ratio_pct: float
    today_kwh: float
    open_alerts: int
    pending_work_orders: int
    in_progress_work_orders: int
    today_completed_work_orders: int
    mttr_hours: float
    mtbf_days: float
    availability_pct: float


# WebSocket 推播訊息格式
class WsMessage(BaseModel):
    type: Literal[
        'device_update', 'alert_new', 'alert_update',
        'kpi_update', 'workorder_update', 'heartbeat'
    ]
    payload: dict
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
