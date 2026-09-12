"""SQLAlchemy ORM 模型 — 使用可攜式型別，相容 PostgreSQL 與 MSSQL"""
from sqlalchemy import Column, String, Float, Integer, Text
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class AlertORM(Base):
    __tablename__ = "alerts"

    id                   = Column(String(50),  primary_key=True)
    asset_id             = Column(String(50),  nullable=False)
    asset_name           = Column(String(200), nullable=False)
    title                = Column(String(500), nullable=False)
    description          = Column(Text,        nullable=False, default="")
    severity             = Column(String(20),  nullable=False)
    status               = Column(String(20),  nullable=False, default="open")
    occurred_at          = Column(String(50),  nullable=False)
    ai_root_cause        = Column(Text,        nullable=True)
    ai_action_suggestion = Column(Text,        nullable=True)
    floor                = Column(Integer,     nullable=False, default=1)
    building_id          = Column(String(50),  nullable=False, default="")


class WorkOrderORM(Base):
    __tablename__ = "work_orders"

    id               = Column(String(50),  primary_key=True)
    wo_number        = Column(String(50),  nullable=False)
    wo_type          = Column(String(10),  nullable=False)
    title            = Column(String(500), nullable=False)
    priority         = Column(String(20),  nullable=False)
    status           = Column(String(20),  nullable=False)
    asset_id         = Column(String(50),  nullable=False)
    asset_name       = Column(String(200), nullable=False)
    assigned_to      = Column(String(100), nullable=True)
    estimated_hours  = Column(Float,       nullable=False)
    actual_hours     = Column(Float,       nullable=True)
    created_at       = Column(String(50),  nullable=False)
    ai_root_cause    = Column(Text,        nullable=True)


class UserORM(Base):
    __tablename__ = "users"

    id           = Column(String(50),  primary_key=True)
    username     = Column(String(200), nullable=False, unique=True, index=True)
    name         = Column(String(100), nullable=False)
    hashed_password = Column(String(200), nullable=False)
    role         = Column(String(20),  nullable=False, default="viewer")
    avatar_color = Column(String(20),  nullable=False, default="#06b6d4")
    is_active    = Column(Integer,     nullable=False, default=1)
    created_at   = Column(String(50),  nullable=False)


class PushSubscriptionORM(Base):
    __tablename__ = "push_subscriptions"

    endpoint   = Column(String(2000), primary_key=True)
    p256dh     = Column(String(200),  nullable=False)
    auth_key   = Column(String(100),  nullable=False)
    username   = Column(String(200),  nullable=False, default="")
    created_at = Column(String(50),   nullable=False)


class AlertRuleORM(Base):
    __tablename__ = "alert_rules"

    id         = Column(String(50),  primary_key=True)
    name       = Column(String(200), nullable=False)
    device_id  = Column(String(50),  nullable=False, default="*")
    metric     = Column(String(30),  nullable=False)
    operator   = Column(String(5),   nullable=False)
    threshold  = Column(Float,       nullable=False)
    severity   = Column(String(20),  nullable=False)
    enabled    = Column(Integer,     nullable=False, default=1)
    created_at = Column(String(50),  nullable=False)
    created_by = Column(String(100), nullable=False, default="")


class WebhookConfigORM(Base):
    __tablename__ = "webhook_configs"

    id                = Column(String(20),   primary_key=True, default="global")
    enabled           = Column(Integer,      nullable=False, default=0)
    url               = Column(String(2000), nullable=False, default="")
    min_severity      = Column(String(20),   nullable=False, default="CRITICAL")
    cooldown_minutes  = Column(Integer,      nullable=False, default=5)
    last_triggered_at = Column(String(50),   nullable=True)
    last_status       = Column(String(20),   nullable=True)   # ok | fail | None


class ReportScheduleORM(Base):
    __tablename__ = "report_schedules"

    id           = Column(String(20),   primary_key=True, default="global")
    enabled      = Column(Integer,      nullable=False, default=0)
    frequency    = Column(String(10),   nullable=False, default="daily")   # daily | weekly
    weekday      = Column(Integer,      nullable=False, default=1)          # 0=Mon … 6=Sun (weekly only)
    hour         = Column(Integer,      nullable=False, default=8)          # 0-23
    recipients   = Column(Text,         nullable=False, default="")         # comma-separated
    last_sent_at = Column(String(50),   nullable=True)
    last_status  = Column(String(20),   nullable=True)                      # ok | fail


class DeviceMetricORM(Base):
    __tablename__ = "device_metrics"

    id          = Column(Integer,    primary_key=True, autoincrement=True)
    device_id   = Column(String(50), nullable=False, index=True)
    recorded_at = Column(String(50), nullable=False, index=True)   # ISO 8601
    power_kw    = Column(Float,      nullable=True)
    temperature = Column(Float,      nullable=True)
    ai_score    = Column(Float,      nullable=True)
    rul_days    = Column(Float,      nullable=True)


class ShiftLogORM(Base):
    __tablename__ = "shift_logs"

    id              = Column(String(50),  primary_key=True)
    shift_type      = Column(String(20),  nullable=False)   # morning | afternoon | night
    operator_name   = Column(String(100), nullable=False)
    start_time      = Column(String(50),  nullable=False, index=True)
    end_time        = Column(String(50),  nullable=True)
    summary         = Column(Text,        nullable=False, default="")
    incidents       = Column(Text,        nullable=False, default="[]")  # JSON array
    handover_notes  = Column(Text,        nullable=False, default="")
    device_snapshot = Column(Text,        nullable=True)   # JSON {critical,warning,offline,open_alerts}
    is_closed       = Column(Integer,     nullable=False, default=0)
    created_at      = Column(String(50),  nullable=False)


class InboxNotificationORM(Base):
    __tablename__ = "inbox_notifications"

    id         = Column(String(50),  primary_key=True)
    type       = Column(String(30),  nullable=False)   # alert_new | device_offline | device_critical | workorder_created | workorder_completed
    title      = Column(String(200), nullable=False)
    message    = Column(Text,        nullable=False, default="")
    severity   = Column(String(20),  nullable=True)    # CRITICAL | ALARM | WARNING | INFO
    related_id = Column(String(50),  nullable=True)
    is_read    = Column(Integer,     nullable=False, default=0)
    created_at = Column(String(50),  nullable=False, index=True)


class UserPreferenceORM(Base):
    __tablename__ = "user_preferences"

    user_id    = Column(String(50), primary_key=True)
    data       = Column(Text,       nullable=False, default="{}")
    updated_at = Column(String(50), nullable=False, default="")


class AuditLogORM(Base):
    __tablename__ = "audit_logs"

    id          = Column(String(50),  primary_key=True)
    timestamp   = Column(String(50),  nullable=False)
    operation   = Column(String(50),  nullable=False)
    actor       = Column(String(100), nullable=False, default="operator")
    device_id   = Column(String(50),  nullable=False, default="")
    device_name = Column(String(200), nullable=False, default="")
    command     = Column(String(100), nullable=False, default="")
    result      = Column(String(20),  nullable=False, default="success")
    message     = Column(Text,        nullable=False, default="")


class SparePartORM(Base):
    __tablename__ = "spare_parts"

    id              = Column(String(50),  primary_key=True)
    part_number     = Column(String(50),  nullable=False, unique=True, index=True)
    name            = Column(String(200), nullable=False)
    description     = Column(Text,        nullable=False, default="")
    category        = Column(String(20),  nullable=False, default="General")  # HVAC|Power|IT|Fire|Security|General
    unit            = Column(String(20),  nullable=False, default="個")
    quantity        = Column(Integer,     nullable=False, default=0)
    min_stock_level = Column(Integer,     nullable=False, default=1)
    unit_cost       = Column(Float,       nullable=False, default=0.0)   # NT$
    location        = Column(String(100), nullable=False, default="")
    supplier_name   = Column(String(200), nullable=False, default="")
    updated_at      = Column(String(50),  nullable=False, default="")


class InspectionRouteORM(Base):
    __tablename__ = "inspection_routes"

    id          = Column(String(50),  primary_key=True)
    name        = Column(String(200), nullable=False)
    description = Column(Text,        nullable=False, default="")
    device_ids  = Column(Text,        nullable=False, default="[]")   # JSON array of device IDs
    frequency   = Column(String(20),  nullable=False, default="daily")  # daily|weekly|monthly|as_needed
    created_by  = Column(String(100), nullable=False, default="")
    created_at  = Column(String(50),  nullable=False)


class InspectionRecordORM(Base):
    __tablename__ = "inspection_records"

    id             = Column(String(50),  primary_key=True)
    route_id       = Column(String(50),  nullable=False, index=True)
    route_name     = Column(String(200), nullable=False)
    inspector_name = Column(String(100), nullable=False)
    started_at     = Column(String(50),  nullable=False, index=True)
    completed_at   = Column(String(50),  nullable=True)
    status         = Column(String(20),  nullable=False, default="in_progress")  # in_progress|completed|abandoned
    findings       = Column(Text,        nullable=False, default="[]")  # JSON array
    overall_result = Column(String(10),  nullable=True)                 # pass|fail|partial


class MonitoringPointORM(Base):
    __tablename__ = "monitoring_points"
    id              = Column(String(50),  primary_key=True)
    point_id        = Column(String(100), nullable=False, unique=True, index=True)
    point_code      = Column(String(100), nullable=False)
    point_name      = Column(String(255), nullable=False)
    point_type      = Column(String(10),  nullable=False)   # DI|DO|AI|AO
    system_type     = Column(String(100), nullable=False, default="")
    equipment_name  = Column(String(255), nullable=False, default="")
    unit            = Column(String(50),  nullable=False, default="")
    normal_value    = Column(String(50),  nullable=True)
    alarm_value     = Column(String(50),  nullable=True)
    min_value       = Column(Float,       nullable=True)
    max_value       = Column(Float,       nullable=True)
    warning_low     = Column(Float,       nullable=True)   # 警告下限
    alarm_low       = Column(Float,       nullable=True)   # 告警下限（嚴重）
    warning_high    = Column(Float,       nullable=True)   # 警告上限
    alarm_high      = Column(Float,       nullable=True)   # 告警上限（嚴重）
    description     = Column(Text,        nullable=False, default="")
    created_at      = Column(String(50),  nullable=False)


class PointRealtimeValueORM(Base):
    __tablename__ = "point_realtime_values"
    point_id    = Column(String(100), primary_key=True)
    value       = Column(Float,       nullable=False)
    updated_at  = Column(String(50),  nullable=False, index=True)

class ModelPointBindingORM(Base):
    __tablename__ = "model_point_bindings"
    id              = Column(String(50),  primary_key=True)
    model_uuid      = Column(String(100), nullable=False, index=True)
    model_name      = Column(String(255), nullable=False, default="")
    point_id        = Column(String(100), nullable=False, index=True)
    point_type      = Column(String(10),  nullable=False)   # DI|DO|AI|AO
    display_mode    = Column(String(50),  nullable=False, default="color")
    normal_color    = Column(String(20),  nullable=False, default="#22C55E")
    alarm_color     = Column(String(20),  nullable=False, default="#EF4444")
    offline_color   = Column(String(20),  nullable=False, default="#9CA3AF")
    control_enabled = Column(Integer,     nullable=False, default=0)
    value_position  = Column(String(50),  nullable=False, default="auto")
    is_active       = Column(Integer,     nullable=False, default=1)
    created_at      = Column(String(50),  nullable=False)


class ControlCommandLogORM(Base):
    __tablename__ = "control_command_logs"
    id          = Column(String(50),  primary_key=True)
    point_id    = Column(String(100), nullable=False, index=True)
    model_uuid  = Column(String(100), nullable=False, index=True)
    value       = Column(Float,       nullable=False)
    issued_by   = Column(String(100), nullable=False, default="")
    result      = Column(String(20),  nullable=False, default="sent")  # sent|ack|fail
    created_at  = Column(String(50),  nullable=False, index=True)
