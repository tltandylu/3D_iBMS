"""資料庫存取層 — 統一介面，與底層資料庫方言無關"""
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AlertORM, WorkOrderORM, AuditLogORM, UserORM, PushSubscriptionORM, WebhookConfigORM, AlertRuleORM, ReportScheduleORM, DeviceMetricORM, UserPreferenceORM, InboxNotificationORM, ShiftLogORM, InspectionRouteORM, InspectionRecordORM, SparePartORM, MonitoringPointORM, ModelPointBindingORM, ControlCommandLogORM, PointRealtimeValueORM
from app.models import Alert, WorkOrder


class DBRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Users ─────────────────────────────────────────────────────────────

    async def get_user(self, username: str) -> dict | None:
        """依 username（= email）查詢使用者"""
        row = (await self.session.execute(
            select(UserORM).where(UserORM.username == username)
        )).scalar_one_or_none()
        return _to_user_dict(row) if row else None

    async def user_count(self) -> int:
        from sqlalchemy import func
        return (await self.session.execute(
            select(func.count()).select_from(UserORM)
        )).scalar_one()

    async def create_user(self, *, user_id: str, username: str, name: str,
                          hashed_password: str, role: str, avatar_color: str,
                          created_at: str) -> None:
        row = UserORM(
            id=user_id, username=username, name=name,
            hashed_password=hashed_password, role=role,
            avatar_color=avatar_color, is_active=1, created_at=created_at,
        )
        self.session.add(row)
        await self.session.commit()

    async def list_users(self) -> list[dict]:
        rows = (await self.session.execute(
            select(UserORM).order_by(UserORM.created_at)
        )).scalars().all()
        return [_to_user_public(r) for r in rows]

    async def update_user(self, user_id: str, updates: dict) -> None:
        if "is_active" in updates and isinstance(updates["is_active"], bool):
            updates["is_active"] = 1 if updates["is_active"] else 0
        await self.session.execute(
            sa_update(UserORM).where(UserORM.id == user_id).values(**updates)
        )
        await self.session.commit()

    async def update_user_password(self, user_id: str, hashed: str) -> None:
        await self.session.execute(
            sa_update(UserORM).where(UserORM.id == user_id).values(hashed_password=hashed)
        )
        await self.session.commit()

    # ── Device Metrics (時序) ─────────────────────────────────────────────

    async def save_device_metrics(self, rows: list[dict]) -> None:
        for r in rows:
            self.session.add(DeviceMetricORM(**r))
        await self.session.commit()

    async def get_device_history(self, device_id: str, hours: int = 24) -> list[dict]:
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(hours=hours)).isoformat()
        result = (await self.session.execute(
            select(DeviceMetricORM)
            .where(DeviceMetricORM.device_id == device_id)
            .where(DeviceMetricORM.recorded_at >= cutoff)
            .order_by(DeviceMetricORM.recorded_at)
        )).scalars().all()
        if not result:
            return []
        # 最多回傳 200 個資料點
        step = max(1, len(result) // 200)
        rows_out = result[::step]
        return [
            {
                "time":        r.recorded_at[11:16],
                "power_kw":    r.power_kw,
                "temperature": r.temperature,
                "ai_score":    r.ai_score,
                "rul_days":    r.rul_days,
            }
            for r in rows_out
        ]

    async def get_device_analytics(self, device_id: str, hours: int = 24) -> dict | None:
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(hours=hours)).isoformat()
        rows = (await self.session.execute(
            select(DeviceMetricORM)
            .where(DeviceMetricORM.device_id == device_id)
            .where(DeviceMetricORM.recorded_at >= cutoff)
            .order_by(DeviceMetricORM.recorded_at)
        )).scalars().all()

        if not rows:
            return None

        powers = [r.power_kw    for r in rows if r.power_kw    is not None]
        temps  = [r.temperature for r in rows if r.temperature is not None]
        scores = [r.ai_score    for r in rows if r.ai_score    is not None]

        if not powers:
            return None

        # 趨勢：比較前三分之一與後三分之一的均值
        n     = len(powers)
        third = max(1, n // 3)
        first_avg = sum(powers[:third]) / third
        last_avg  = sum(powers[-third:]) / third
        change_pct = ((last_avg - first_avg) / max(first_avg, 0.01)) * 100
        trend = "rising" if change_pct > 5 else "falling" if change_pct < -5 else "stable"

        peak_idx  = powers.index(max(powers))
        peak_time = rows[peak_idx].recorded_at[11:16] if peak_idx < len(rows) else None

        return {
            "device_id":        device_id,
            "period_hours":     hours,
            "data_points":      n,
            "avg_power_kw":     round(sum(powers) / len(powers), 1),
            "max_power_kw":     round(max(powers), 1),
            "min_power_kw":     round(min(powers), 1),
            "power_trend":      trend,
            "power_change_pct": round(change_pct, 1),
            "peak_power_time":  peak_time,
            "avg_temperature":  round(sum(temps) / len(temps), 1) if temps else None,
            "max_temperature":  round(max(temps), 1) if temps else None,
            "avg_ai_score":     round(sum(scores) / len(scores), 3) if scores else None,
        }

    async def prune_old_metrics(self, days: int = 7) -> int:
        from datetime import datetime, timedelta
        from sqlalchemy import delete as sa_delete
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        res = await self.session.execute(
            sa_delete(DeviceMetricORM).where(DeviceMetricORM.recorded_at < cutoff)
        )
        await self.session.commit()
        return res.rowcount

    async def get_daily_energy(self, days: int = 30) -> list[dict]:
        from sqlalchemy import func
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        rows = (await self.session.execute(
            select(
                func.substr(DeviceMetricORM.recorded_at, 1, 10).label("date"),
                (func.sum(DeviceMetricORM.power_kw) / 60).label("total_kwh"),
                func.max(DeviceMetricORM.power_kw).label("peak_kw"),
                func.avg(DeviceMetricORM.power_kw).label("avg_kw"),
                func.count().label("samples"),
            )
            .where(DeviceMetricORM.recorded_at >= cutoff)
            .where(DeviceMetricORM.power_kw.isnot(None))
            .group_by(func.substr(DeviceMetricORM.recorded_at, 1, 10))
            .order_by(func.substr(DeviceMetricORM.recorded_at, 1, 10))
        )).all()
        return [
            {
                "date":      r.date,
                "total_kwh": round(float(r.total_kwh), 1),
                "peak_kw":   round(float(r.peak_kw),   1),
                "avg_kw":    round(float(r.avg_kw),     1),
                "samples":   r.samples,
            }
            for r in rows
        ]

    async def get_monthly_energy(self, months: int = 13) -> list[dict]:
        """過去 N 個月的每月用電統計（聚合自 device_metrics）"""
        from sqlalchemy import func
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(days=months * 31)).isoformat()
        rows = (await self.session.execute(
            select(
                func.substr(DeviceMetricORM.recorded_at, 1, 7).label("month"),
                (func.sum(DeviceMetricORM.power_kw) / 60).label("total_kwh"),
                func.max(DeviceMetricORM.power_kw).label("peak_kw"),
                func.count().label("samples"),
            )
            .where(DeviceMetricORM.recorded_at >= cutoff)
            .where(DeviceMetricORM.power_kw.isnot(None))
            .group_by(func.substr(DeviceMetricORM.recorded_at, 1, 7))
            .order_by(func.substr(DeviceMetricORM.recorded_at, 1, 7))
        )).all()
        return [
            {
                "month":     r.month,
                "total_kwh": round(float(r.total_kwh), 1),
                "peak_kw":   round(float(r.peak_kw),   1),
                "samples":   r.samples,
            }
            for r in rows
        ]

    async def get_oee_history(self, days: int = 7) -> list[dict]:
        from sqlalchemy import func
        from datetime import datetime, timedelta
        import math
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        rows = (await self.session.execute(
            select(
                func.substr(DeviceMetricORM.recorded_at, 1, 10).label("date"),
                func.avg(DeviceMetricORM.ai_score).label("avg_ai"),
                func.avg(DeviceMetricORM.power_kw).label("avg_power"),
                func.max(DeviceMetricORM.power_kw).label("max_power"),
            )
            .where(DeviceMetricORM.recorded_at >= cutoff)
            .where(DeviceMetricORM.ai_score.isnot(None))
            .group_by(func.substr(DeviceMetricORM.recorded_at, 1, 10))
            .order_by(func.substr(DeviceMetricORM.recorded_at, 1, 10))
        )).all()
        result = []
        for r in rows:
            ai = float(r.avg_ai or 0.1)
            avail = max(0.0, min(1.0, 1 - ai * 0.8))
            perf  = max(0.3,  min(1.0, 1 - ai * 0.55))
            qual  = max(0.55, min(1.0, 1 - ai * 0.3))
            oee   = avail * perf * qual
            result.append({
                "date":  r.date,
                "oee":   round(oee,   3),
                "avail": round(avail, 3),
                "perf":  round(perf,  3),
                "qual":  round(qual,  3),
            })
        return result

    # ── Shift Logs ────────────────────────────────────────────────────────

    async def create_shift_log(
        self, *, log_id: str, shift_type: str, operator_name: str,
        start_time: str, summary: str = "", device_snapshot: str | None = None,
        created_at: str,
    ) -> None:
        self.session.add(ShiftLogORM(
            id=log_id, shift_type=shift_type, operator_name=operator_name,
            start_time=start_time, summary=summary, incidents="[]",
            handover_notes="", device_snapshot=device_snapshot,
            is_closed=0, created_at=created_at,
        ))
        await self.session.commit()

    async def get_active_shift(self) -> dict | None:
        row = (await self.session.execute(
            select(ShiftLogORM)
            .where(ShiftLogORM.is_closed == 0)
            .order_by(ShiftLogORM.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()
        return _to_shift_log(row) if row else None

    async def list_shift_logs(self, limit: int = 20) -> list[dict]:
        rows = (await self.session.execute(
            select(ShiftLogORM).order_by(ShiftLogORM.created_at.desc()).limit(limit)
        )).scalars().all()
        return [_to_shift_log(r) for r in rows]

    async def get_shift_log(self, log_id: str) -> dict | None:
        row = (await self.session.execute(
            select(ShiftLogORM).where(ShiftLogORM.id == log_id)
        )).scalar_one_or_none()
        return _to_shift_log(row) if row else None

    async def close_shift_log(self, log_id: str, end_time: str, handover_notes: str, summary: str) -> None:
        await self.session.execute(
            sa_update(ShiftLogORM)
            .where(ShiftLogORM.id == log_id)
            .values(is_closed=1, end_time=end_time, handover_notes=handover_notes, summary=summary)
        )
        await self.session.commit()

    async def add_shift_incident(self, log_id: str, incidents_json: str) -> None:
        await self.session.execute(
            sa_update(ShiftLogORM)
            .where(ShiftLogORM.id == log_id)
            .values(incidents=incidents_json)
        )
        await self.session.commit()

    # ── Inbox Notifications ───────────────────────────────────────────────

    async def create_inbox_notification(
        self, *, notif_id: str, type: str, title: str,
        message: str = "", severity: str | None = None,
        related_id: str | None = None, created_at: str,
    ) -> None:
        self.session.add(InboxNotificationORM(
            id=notif_id, type=type, title=title,
            message=message, severity=severity,
            related_id=related_id, is_read=0, created_at=created_at,
        ))
        await self.session.commit()

    async def list_inbox_notifications(self, limit: int = 50, unread_only: bool = False) -> list[dict]:
        q = select(InboxNotificationORM).order_by(InboxNotificationORM.created_at.desc()).limit(limit)
        if unread_only:
            q = q.where(InboxNotificationORM.is_read == 0)
        rows = (await self.session.execute(q)).scalars().all()
        return [_to_inbox_notif(r) for r in rows]

    async def inbox_unread_count(self) -> int:
        from sqlalchemy import func
        return (await self.session.execute(
            select(func.count()).select_from(InboxNotificationORM)
            .where(InboxNotificationORM.is_read == 0)
        )).scalar_one()

    async def mark_inbox_read(self, notif_id: str) -> None:
        await self.session.execute(
            sa_update(InboxNotificationORM)
            .where(InboxNotificationORM.id == notif_id)
            .values(is_read=1)
        )
        await self.session.commit()

    async def mark_inbox_all_read(self) -> None:
        await self.session.execute(
            sa_update(InboxNotificationORM)
            .where(InboxNotificationORM.is_read == 0)
            .values(is_read=1)
        )
        await self.session.commit()

    async def prune_old_notifications(self, days: int = 30) -> int:
        from sqlalchemy import delete as sa_delete
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        res = await self.session.execute(
            sa_delete(InboxNotificationORM).where(InboxNotificationORM.created_at < cutoff)
        )
        await self.session.commit()
        return res.rowcount

    # ── User Preferences ─────────────────────────────────────────────────

    async def get_user_pref(self, user_id: str) -> dict | None:
        row = (await self.session.execute(
            select(UserPreferenceORM).where(UserPreferenceORM.user_id == user_id)
        )).scalar_one_or_none()
        if not row:
            return None
        import json
        return {"user_id": row.user_id, "data": json.loads(row.data), "updated_at": row.updated_at}

    async def upsert_user_pref(self, user_id: str, data: str, updated_at: str) -> None:
        row = UserPreferenceORM(user_id=user_id, data=data, updated_at=updated_at)
        await self.session.merge(row)
        await self.session.commit()

    # ── Push Subscriptions ────────────────────────────────────────────────

    async def save_push_subscription(
        self, username: str, endpoint: str, p256dh: str, auth_key: str, created_at: str
    ) -> None:
        row = PushSubscriptionORM(
            endpoint=endpoint, p256dh=p256dh, auth_key=auth_key,
            username=username, created_at=created_at,
        )
        await self.session.merge(row)
        await self.session.commit()

    async def get_push_subscriptions(self) -> list[dict]:
        rows = (await self.session.execute(
            select(PushSubscriptionORM)
        )).scalars().all()
        return [
            {"endpoint": r.endpoint, "p256dh": r.p256dh, "auth_key": r.auth_key}
            for r in rows
        ]

    async def delete_push_subscription(self, endpoint: str) -> None:
        from sqlalchemy import delete as sa_delete
        await self.session.execute(
            sa_delete(PushSubscriptionORM).where(PushSubscriptionORM.endpoint == endpoint)
        )
        await self.session.commit()

    # ── Alerts ────────────────────────────────────────────────────────────

    async def upsert_alert(self, alert: Alert) -> None:
        row = AlertORM(
            id=alert.id,
            asset_id=alert.asset_id,
            asset_name=alert.asset_name,
            title=alert.title,
            description=alert.description or "",
            severity=alert.severity,
            status=alert.status,
            occurred_at=alert.occurred_at,
            ai_root_cause=alert.ai_root_cause,
            ai_action_suggestion=alert.ai_action_suggestion,
            floor=alert.floor,
            building_id=alert.building_id,
        )
        await self.session.merge(row)
        await self.session.commit()

    async def update_alert_status(self, alert_id: str, status: str) -> None:
        await self.session.execute(
            sa_update(AlertORM)
            .where(AlertORM.id == alert_id)
            .values(status=status)
        )
        await self.session.commit()

    async def get_alerts(
        self, status: str | None = None, limit: int = 50
    ) -> list[Alert]:
        q = (
            select(AlertORM)
            .order_by(AlertORM.occurred_at.desc())
            .limit(limit)
        )
        if status:
            q = q.where(AlertORM.status == status)
        rows = (await self.session.execute(q)).scalars().all()
        return [_to_alert(r) for r in rows]

    # ── Work Orders ───────────────────────────────────────────────────────

    async def upsert_workorder(self, wo: WorkOrder) -> None:
        row = WorkOrderORM(
            id=wo.id,
            wo_number=wo.wo_number,
            wo_type=wo.wo_type,
            title=wo.title,
            priority=wo.priority,
            status=wo.status,
            asset_id=wo.asset_id,
            asset_name=wo.asset_name,
            assigned_to=wo.assigned_to,
            estimated_hours=wo.estimated_hours,
            actual_hours=wo.actual_hours,
            created_at=wo.created_at,
            ai_root_cause=wo.ai_root_cause,
        )
        await self.session.merge(row)
        await self.session.commit()

    async def update_workorder_status(self, wo_id: str, status: str) -> None:
        await self.session.execute(
            sa_update(WorkOrderORM)
            .where(WorkOrderORM.id == wo_id)
            .values(status=status)
        )
        await self.session.commit()

    async def get_workorders(
        self, status: str | None = None
    ) -> list[WorkOrder]:
        q = select(WorkOrderORM).order_by(WorkOrderORM.created_at.desc())
        if status:
            q = q.where(WorkOrderORM.status == status)
        rows = (await self.session.execute(q)).scalars().all()
        return [_to_workorder(r) for r in rows]

    # ── Report Schedule ───────────────────────────────────────────────────────

    async def get_report_schedule(self) -> dict | None:
        row = (await self.session.execute(
            select(ReportScheduleORM).where(ReportScheduleORM.id == "global")
        )).scalar_one_or_none()
        return _to_report_schedule(row) if row else None

    async def upsert_report_schedule(
        self, *, enabled: bool, frequency: str, weekday: int,
        hour: int, recipients: str,
    ) -> None:
        row = ReportScheduleORM(
            id="global", enabled=1 if enabled else 0,
            frequency=frequency, weekday=weekday,
            hour=hour, recipients=recipients,
        )
        await self.session.merge(row)
        await self.session.commit()

    async def update_report_delivery(self, last_sent_at: str, status: str) -> None:
        await self.session.execute(
            sa_update(ReportScheduleORM)
            .where(ReportScheduleORM.id == "global")
            .values(last_sent_at=last_sent_at, last_status=status)
        )
        await self.session.commit()

    # ── Alert Rules ───────────────────────────────────────────────────────────

    async def list_alert_rules(self) -> list[dict]:
        rows = (await self.session.execute(
            select(AlertRuleORM).order_by(AlertRuleORM.created_at)
        )).scalars().all()
        return [_to_alert_rule(r) for r in rows]

    async def upsert_alert_rule(self, rule: dict) -> None:
        row = AlertRuleORM(
            id=rule["id"], name=rule["name"], device_id=rule["device_id"],
            metric=rule["metric"], operator=rule["operator"],
            threshold=float(rule["threshold"]), severity=rule["severity"],
            enabled=1 if rule.get("enabled", True) else 0,
            created_at=rule["created_at"],
            created_by=rule.get("created_by", ""),
        )
        await self.session.merge(row)
        await self.session.commit()

    async def delete_alert_rule(self, rule_id: str) -> None:
        from sqlalchemy import delete as sa_delete
        await self.session.execute(
            sa_delete(AlertRuleORM).where(AlertRuleORM.id == rule_id)
        )
        await self.session.commit()

    async def toggle_alert_rule(self, rule_id: str) -> dict | None:
        row = (await self.session.execute(
            select(AlertRuleORM).where(AlertRuleORM.id == rule_id)
        )).scalar_one_or_none()
        if not row:
            return None
        row.enabled = 0 if row.enabled else 1
        await self.session.commit()
        return _to_alert_rule(row)

    # ── Webhook Config ────────────────────────────────────────────────────────

    async def get_webhook_config(self) -> dict | None:
        row = (await self.session.execute(
            select(WebhookConfigORM).where(WebhookConfigORM.id == "global")
        )).scalar_one_or_none()
        return _to_webhook_config(row) if row else None

    async def upsert_webhook_config(
        self, *, enabled: bool, url: str,
        min_severity: str, cooldown_minutes: int,
    ) -> None:
        row = WebhookConfigORM(
            id="global",
            enabled=1 if enabled else 0,
            url=url,
            min_severity=min_severity,
            cooldown_minutes=cooldown_minutes,
        )
        await self.session.merge(row)
        await self.session.commit()

    async def update_webhook_delivery(self, last_triggered_at: str, status: str) -> None:
        await self.session.execute(
            sa_update(WebhookConfigORM)
            .where(WebhookConfigORM.id == "global")
            .values(last_triggered_at=last_triggered_at, last_status=status)
        )
        await self.session.commit()

    # ── Spare Parts ───────────────────────────────────────────────────────

    async def list_spare_parts(self) -> list[dict]:
        rows = (await self.session.execute(
            select(SparePartORM).order_by(SparePartORM.category, SparePartORM.name)
        )).scalars().all()
        return [_to_spare_part(r) for r in rows]

    async def get_spare_part(self, part_id: str) -> dict | None:
        row = (await self.session.execute(
            select(SparePartORM).where(SparePartORM.id == part_id)
        )).scalar_one_or_none()
        return _to_spare_part(row) if row else None

    async def upsert_spare_part(self, part: dict) -> None:
        row = SparePartORM(
            id=part["id"],
            part_number=part["part_number"],
            name=part["name"],
            description=part.get("description", ""),
            category=part.get("category", "General"),
            unit=part.get("unit", "個"),
            quantity=int(part.get("quantity", 0)),
            min_stock_level=int(part.get("min_stock_level", 1)),
            unit_cost=float(part.get("unit_cost", 0)),
            location=part.get("location", ""),
            supplier_name=part.get("supplier_name", ""),
            updated_at=part.get("updated_at", ""),
        )
        await self.session.merge(row)
        await self.session.commit()

    async def update_spare_part_quantity(self, part_id: str, delta: int, updated_at: str) -> None:
        row = (await self.session.execute(
            select(SparePartORM).where(SparePartORM.id == part_id)
        )).scalar_one_or_none()
        if row:
            row.quantity = max(0, row.quantity + delta)
            row.updated_at = updated_at
            await self.session.commit()

    async def delete_spare_part(self, part_id: str) -> None:
        from sqlalchemy import delete as sa_delete
        await self.session.execute(
            sa_delete(SparePartORM).where(SparePartORM.id == part_id)
        )
        await self.session.commit()

    async def spare_part_count(self) -> int:
        from sqlalchemy import func
        return (await self.session.execute(
            select(func.count()).select_from(SparePartORM)
        )).scalar_one()

    # ── Monitoring Points ─────────────────────────────────────────────────
    async def monitoring_point_count(self) -> int:
        from sqlalchemy import func
        return (await self.session.execute(
            select(func.count()).select_from(MonitoringPointORM)
        )).scalar_one()

    async def list_monitoring_points(self) -> list[dict]:
        rows = (await self.session.execute(
            select(MonitoringPointORM).order_by(MonitoringPointORM.point_type, MonitoringPointORM.point_id)
        )).scalars().all()
        return [_to_monitoring_point(r) for r in rows]

    async def upsert_monitoring_point(self, data: dict) -> None:
        row = MonitoringPointORM(**data)
        await self.session.merge(row)
        await self.session.commit()

    async def delete_monitoring_point(self, point_id: str) -> None:
        row = (await self.session.execute(
            select(MonitoringPointORM).where(MonitoringPointORM.point_id == point_id)
        )).scalar_one_or_none()
        if row:
            await self.session.delete(row)
            await self.session.commit()

    # ── Model-Point Bindings ───────────────────────────────────────────────
    async def list_model_point_bindings(self, model_uuid: str | None = None) -> list[dict]:
        q = select(ModelPointBindingORM).order_by(ModelPointBindingORM.created_at)
        if model_uuid:
            q = q.where(ModelPointBindingORM.model_uuid == model_uuid)
        rows = (await self.session.execute(q)).scalars().all()
        return [_to_model_point_binding(r) for r in rows]

    async def upsert_model_point_binding(self, data: dict) -> None:
        row = ModelPointBindingORM(**data)
        await self.session.merge(row)
        await self.session.commit()

    async def delete_model_point_binding(self, binding_id: str) -> None:
        row = (await self.session.execute(
            select(ModelPointBindingORM).where(ModelPointBindingORM.id == binding_id)
        )).scalar_one_or_none()
        if row:
            await self.session.delete(row)
            await self.session.commit()

    async def binding_count(self) -> int:
        from sqlalchemy import func
        return (await self.session.execute(
            select(func.count()).select_from(ModelPointBindingORM)
        )).scalar_one()

    # ── Control Command Logs ──────────────────────────────────────
    async def create_control_log(self, data: dict) -> None:
        self.session.add(ControlCommandLogORM(**data))
        await self.session.commit()

    # ── Point Realtime Values ─────────────────────────────────────
    async def upsert_point_realtime_values(self, values: dict[str, float], updated_at: str) -> None:
        for pid, val in values.items():
            row = PointRealtimeValueORM(point_id=pid, value=val, updated_at=updated_at)
            await self.session.merge(row)
        await self.session.commit()

    async def get_point_realtime_values(self) -> dict[str, float]:
        rows = (await self.session.execute(select(PointRealtimeValueORM))).scalars().all()
        return {r.point_id: r.value for r in rows}

    async def list_control_logs(self, limit: int = 100, point_id: str | None = None) -> list[dict]:
        q = (
            select(ControlCommandLogORM)
            .order_by(ControlCommandLogORM.created_at.desc())
            .limit(limit)
        )
        if point_id:
            q = q.where(ControlCommandLogORM.point_id == point_id)
        rows = (await self.session.execute(q)).scalars().all()
        return [
            {
                "id":         r.id,
                "point_id":   r.point_id,
                "model_uuid": r.model_uuid,
                "value":      r.value,
                "issued_by":  r.issued_by,
                "result":     r.result,
                "created_at": r.created_at,
            }
            for r in rows
        ]

    # ── Inspection Routes & Records ──────────────────────────────────────

    async def list_inspection_routes(self) -> list[dict]:
        rows = (await self.session.execute(
            select(InspectionRouteORM).order_by(InspectionRouteORM.created_at.desc())
        )).scalars().all()
        return [_to_inspection_route(r) for r in rows]

    async def create_inspection_route(
        self, *, route_id: str, name: str, description: str,
        device_ids: str, frequency: str, created_by: str, created_at: str,
    ) -> None:
        self.session.add(InspectionRouteORM(
            id=route_id, name=name, description=description,
            device_ids=device_ids, frequency=frequency,
            created_by=created_by, created_at=created_at,
        ))
        await self.session.commit()

    async def delete_inspection_route(self, route_id: str) -> None:
        from sqlalchemy import delete as sa_delete
        await self.session.execute(
            sa_delete(InspectionRouteORM).where(InspectionRouteORM.id == route_id)
        )
        await self.session.commit()

    async def list_inspection_records(self, limit: int = 30) -> list[dict]:
        rows = (await self.session.execute(
            select(InspectionRecordORM)
            .order_by(InspectionRecordORM.started_at.desc())
            .limit(limit)
        )).scalars().all()
        return [_to_inspection_record(r) for r in rows]

    async def create_inspection_record(
        self, *, record_id: str, route_id: str, route_name: str,
        inspector_name: str, started_at: str, findings: str,
        status: str, completed_at: str | None, overall_result: str | None,
    ) -> None:
        self.session.add(InspectionRecordORM(
            id=record_id, route_id=route_id, route_name=route_name,
            inspector_name=inspector_name, started_at=started_at,
            completed_at=completed_at, status=status,
            findings=findings, overall_result=overall_result,
        ))
        await self.session.commit()

    # ── Audit Logs ────────────────────────────────────────────────────────

    async def save_audit(
        self, *,
        entry_id: str, timestamp: str, operation: str,
        actor: str = "operator", device_id: str = "",
        device_name: str = "", command: str = "",
        result: str = "success", message: str = "",
    ) -> None:
        row = AuditLogORM(
            id=entry_id, timestamp=timestamp, operation=operation,
            actor=actor, device_id=device_id, device_name=device_name,
            command=command, result=result, message=message,
        )
        self.session.add(row)
        await self.session.commit()

    async def get_audit_logs(
        self, limit: int = 100, operation: str | None = None
    ) -> list[dict]:
        q = (
            select(AuditLogORM)
            .order_by(AuditLogORM.timestamp.desc())
            .limit(limit)
        )
        if operation:
            q = q.where(AuditLogORM.operation == operation)
        rows = (await self.session.execute(q)).scalars().all()
        return [
            {
                "id":          r.id,
                "timestamp":   r.timestamp,
                "operation":   r.operation,
                "actor":       r.actor,
                "device_id":   r.device_id,
                "device_name": r.device_name,
                "command":     r.command,
                "result":      r.result,
                "message":     r.message,
            }
            for r in rows
        ]


# ── 型別轉換 ──────────────────────────────────────────────────────────────

def _to_shift_log(r: ShiftLogORM) -> dict:
    import json as _json
    return {
        "id":               r.id,
        "shift_type":       r.shift_type,
        "operator_name":    r.operator_name,
        "start_time":       r.start_time,
        "end_time":         r.end_time,
        "summary":          r.summary,
        "incidents":        _json.loads(r.incidents or "[]"),
        "handover_notes":   r.handover_notes,
        "device_snapshot":  _json.loads(r.device_snapshot) if r.device_snapshot else None,
        "is_closed":        bool(r.is_closed),
        "created_at":       r.created_at,
    }


def _to_inbox_notif(r: InboxNotificationORM) -> dict:
    return {
        "id":         r.id,
        "type":       r.type,
        "title":      r.title,
        "message":    r.message,
        "severity":   r.severity,
        "related_id": r.related_id,
        "is_read":    bool(r.is_read),
        "created_at": r.created_at,
    }


def _to_user_dict(r: UserORM) -> dict:
    return {
        "id": r.id, "username": r.username, "name": r.name,
        "hashed_password": r.hashed_password, "role": r.role,
        "avatar_color": r.avatar_color, "is_active": r.is_active,
    }

def _to_user_public(r: UserORM) -> dict:
    return {
        "id": r.id, "username": r.username, "name": r.name,
        "role": r.role, "avatar_color": r.avatar_color,
        "is_active": r.is_active, "created_at": r.created_at,
    }




def _to_alert(r: AlertORM) -> Alert:
    return Alert(
        id=r.id,
        asset_id=r.asset_id,
        asset_name=r.asset_name,
        title=r.title,
        description=r.description or "",
        severity=r.severity,       # type: ignore[arg-type]
        status=r.status,           # type: ignore[arg-type]
        occurred_at=r.occurred_at,
        ai_root_cause=r.ai_root_cause,
        ai_action_suggestion=r.ai_action_suggestion,
        floor=r.floor,
        building_id=r.building_id,
    )


def _to_report_schedule(r: ReportScheduleORM) -> dict:
    return {
        "enabled":      bool(r.enabled),
        "frequency":    r.frequency,
        "weekday":      r.weekday,
        "hour":         r.hour,
        "recipients":   r.recipients,
        "last_sent_at": r.last_sent_at,
        "last_status":  r.last_status,
    }


def _to_alert_rule(r: AlertRuleORM) -> dict:
    return {
        "id":         r.id,
        "name":       r.name,
        "device_id":  r.device_id,
        "metric":     r.metric,
        "operator":   r.operator,
        "threshold":  r.threshold,
        "severity":   r.severity,
        "enabled":    bool(r.enabled),
        "created_at": r.created_at,
        "created_by": r.created_by,
    }


def _to_webhook_config(r: WebhookConfigORM) -> dict:
    return {
        "enabled":           bool(r.enabled),
        "url":               r.url,
        "min_severity":      r.min_severity,
        "cooldown_minutes":  r.cooldown_minutes,
        "last_triggered_at": r.last_triggered_at,
        "last_status":       r.last_status,
    }


def _to_spare_part(r: SparePartORM) -> dict:
    return {
        "id":              r.id,
        "part_number":     r.part_number,
        "name":            r.name,
        "description":     r.description,
        "category":        r.category,
        "unit":            r.unit,
        "quantity":        r.quantity,
        "min_stock_level": r.min_stock_level,
        "unit_cost":       r.unit_cost,
        "location":        r.location,
        "supplier_name":   r.supplier_name,
        "updated_at":      r.updated_at,
        "stock_status":    "out" if r.quantity == 0 else "low" if r.quantity < r.min_stock_level else "ok",
    }


def _to_inspection_route(r: InspectionRouteORM) -> dict:
    import json as _json
    return {
        "id":          r.id,
        "name":        r.name,
        "description": r.description,
        "device_ids":  _json.loads(r.device_ids or "[]"),
        "frequency":   r.frequency,
        "created_by":  r.created_by,
        "created_at":  r.created_at,
    }


def _to_inspection_record(r: InspectionRecordORM) -> dict:
    import json as _json
    return {
        "id":             r.id,
        "route_id":       r.route_id,
        "route_name":     r.route_name,
        "inspector_name": r.inspector_name,
        "started_at":     r.started_at,
        "completed_at":   r.completed_at,
        "status":         r.status,
        "findings":       _json.loads(r.findings or "[]"),
        "overall_result": r.overall_result,
    }


def _to_workorder(r: WorkOrderORM) -> WorkOrder:
    return WorkOrder(
        id=r.id,
        wo_number=r.wo_number,
        wo_type=r.wo_type,         # type: ignore[arg-type]
        title=r.title,
        priority=r.priority,
        status=r.status,           # type: ignore[arg-type]
        asset_id=r.asset_id,
        asset_name=r.asset_name,
        assigned_to=r.assigned_to,
        estimated_hours=r.estimated_hours,
        actual_hours=r.actual_hours,
        created_at=r.created_at,
        ai_root_cause=r.ai_root_cause,
    )


def _to_monitoring_point(r: MonitoringPointORM) -> dict:
    return {
        "id":             r.id,
        "point_id":       r.point_id,
        "point_code":     r.point_code,
        "point_name":     r.point_name,
        "point_type":     r.point_type,
        "system_type":    r.system_type,
        "equipment_name": r.equipment_name,
        "unit":           r.unit,
        "normal_value":   r.normal_value,
        "alarm_value":    r.alarm_value,
        "min_value":      r.min_value,
        "max_value":      r.max_value,
        "warning_low":    getattr(r, "warning_low",  None),
        "alarm_low":      getattr(r, "alarm_low",    None),
        "warning_high":   getattr(r, "warning_high", None),
        "alarm_high":     getattr(r, "alarm_high",   None),
        "description":    r.description,
        "created_at":     r.created_at,
    }

def _to_model_point_binding(r: ModelPointBindingORM) -> dict:
    return {
        "id":              r.id,
        "model_uuid":      r.model_uuid,
        "model_name":      r.model_name,
        "point_id":        r.point_id,
        "point_type":      r.point_type,
        "display_mode":    r.display_mode,
        "normal_color":    r.normal_color,
        "alarm_color":     r.alarm_color,
        "offline_color":   r.offline_color,
        "control_enabled": bool(r.control_enabled),
        "value_position":  r.value_position,
        "is_active":       bool(r.is_active),
        "created_at":      r.created_at,
    }
