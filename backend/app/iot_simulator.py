"""
Mock IoT 模擬器
模擬 Modbus/BACnet/MQTT 設備的即時資料推送行為
"""
import asyncio
import random
import logging
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.ws_manager import ConnectionManager

logger = logging.getLogger(__name__)

ALERT_TEMPLATES = [
    {"title": "溫度感測器讀值異常", "description": "AI 偵測溫度突增 +5°C", "severity": "WARNING"},
    {"title": "電流不平衡警示",     "description": "三相電流不平衡超過 5%",   "severity": "WARNING"},
    {"title": "UPS 電池電量低",    "description": "SOC 低於 20%",            "severity": "ALARM"},
    {"title": "通訊品質劣化",       "description": "封包遺失率 12%",          "severity": "WARNING"},
    {"title": "振動感測器異常",     "description": "設備振動超標 AI 分數 0.7", "severity": "WARNING"},
]

STATUS_WEIGHTS = {
    "normal":   {"normal": 85, "warning": 10, "critical": 3, "offline": 2},
    "warning":  {"normal": 40, "warning": 45, "critical": 10, "offline": 5},
    "critical": {"normal": 5,  "warning": 25, "critical": 60, "offline": 10},
    "offline":  {"normal": 20, "warning": 20, "critical": 10, "offline": 50},
}

_alert_counter = 200


def _weighted_choice(weights: dict[str, int]) -> str:
    population = list(weights.keys())
    w = list(weights.values())
    return random.choices(population, weights=w, k=1)[0]


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


class IoTSimulator:
    """模擬 OT 層設備資料推播（取代真實 MQTT broker 在 POC 階段）"""

    def __init__(self, manager: "ConnectionManager", store: "DataStore") -> None:
        self.manager = manager
        self.store   = store
        self._running = False

    async def start(self) -> None:
        self._running = True
        await asyncio.gather(
            self._tick_power(),
            self._tick_status(),
            self._tick_alerts(),
            self._tick_heartbeat(),
        )

    async def stop(self) -> None:
        self._running = False

    # ── 每 1 秒：功率 / 溫度微波動 ──────────────────────────
    async def _tick_power(self) -> None:
        while self._running:
            await asyncio.sleep(1)
            updates = []
            for d in self.store.devices:
                if d.status == "offline":
                    continue
                d.current_power_kw = _clamp(
                    d.current_power_kw + random.uniform(-1.5, 1.5),
                    0, d.current_power_kw * 1.8 + 5
                )
                if d.temperature is not None:
                    d.temperature = _clamp(
                        d.temperature + random.uniform(-0.2, 0.2), 5, 65
                    )
                # AI score drift toward status-based target
                base_score = (
                    0.78 if d.status == "critical" else
                    0.50 if d.status == "warning"  else
                    0.90 if d.status == "offline"  else 0.08
                )
                current_score = d.ai_score if d.ai_score is not None else base_score
                drift = random.uniform(-0.02, 0.02)
                d.ai_score = _clamp(current_score + drift * 0.5 + (base_score - current_score) * 0.05, 0.01, 0.99)

                updates.append({
                    "id": d.id,
                    "current_power_kw": round(d.current_power_kw, 2),
                    "temperature": round(d.temperature, 1) if d.temperature is not None else None,
                    "ai_score": round(d.ai_score, 3),
                })

            # 更新 KPI 需量
            total_pw = sum(d.current_power_kw for d in self.store.devices if d.status != "offline")
            self.store.kpi.total_power_kw = round(total_pw, 1)
            delta = random.uniform(-15, 15)
            self.store.kpi.demand_kw = _clamp(
                self.store.kpi.demand_kw + delta, 400, self.store.kpi.contract_demand_kw * 1.05
            )
            self.store.kpi.demand_ratio_pct = round(
                self.store.kpi.demand_kw / self.store.kpi.contract_demand_kw * 100, 1
            )
            self.store.kpi.today_kwh = round(self.store.kpi.today_kwh + total_pw / 3600, 2)

            await self.manager.broadcast({
                "type": "device_update",
                "payload": {"devices": updates},
                "timestamp": datetime.now().isoformat(),
            })
            await self.manager.broadcast({
                "type": "kpi_update",
                "payload": self.store.kpi.model_dump(),
                "timestamp": datetime.now().isoformat(),
            })

    # ── 每 10 秒：偶發狀態切換 ─────────────────────────────
    async def _tick_status(self) -> None:
        while self._running:
            await asyncio.sleep(10)
            if random.random() > 0.45:
                continue
            idx = random.randint(0, len(self.store.devices) - 1)
            dev = self.store.devices[idx]
            if dev.criticality == "CRITICAL" and dev.status == "critical":
                continue
            new_status = _weighted_choice(STATUS_WEIGHTS[dev.status])
            if new_status == dev.status:
                continue
            old = dev.status
            dev.status = new_status  # type: ignore[assignment]
            self._recalc_device_kpi()
            logger.info(f"[IoT] {dev.asset_code}: {old} → {new_status}")
            await self.manager.broadcast({
                "type": "device_update",
                "payload": {"devices": [{"id": dev.id, "status": new_status}]},
                "timestamp": datetime.now().isoformat(),
            })

    # ── 每 25 秒：偶發新告警 ────────────────────────────────
    async def _tick_alerts(self) -> None:
        global _alert_counter
        while self._running:
            await asyncio.sleep(25)
            if random.random() > 0.4:
                continue
            warn_devs = [d for d in self.store.devices if d.status in ("warning", "critical")]
            if not warn_devs:
                continue
            dev = random.choice(warn_devs)
            tmpl = random.choice(ALERT_TEMPLATES)
            _alert_counter += 1
            from app.models import Alert
            new_alert = Alert(
                id=f"al-sim-{_alert_counter}",
                asset_id=dev.id,
                asset_name=dev.name,
                title=f"{dev.asset_code} {tmpl['title']}",
                description=tmpl["description"],
                severity=tmpl["severity"],  # type: ignore[arg-type]
                status="open",
                occurred_at=datetime.now().isoformat(),
                ai_root_cause="AI 分析中...",
                floor=dev.floor,
                building_id=dev.building_id,
            )
            self.store.alerts.insert(0, new_alert)
            self.store.alerts = self.store.alerts[:30]
            self.store.kpi.open_alerts += 1
            logger.info(f"[IoT] 新告警: {new_alert.title}")
            await self.manager.broadcast({
                "type": "alert_new",
                "payload": new_alert.model_dump(),
                "timestamp": datetime.now().isoformat(),
            })

    # ── 每 30 秒：心跳 ──────────────────────────────────────
    async def _tick_heartbeat(self) -> None:
        while self._running:
            await asyncio.sleep(30)
            await self.manager.broadcast({
                "type": "heartbeat",
                "payload": {"connected_clients": self.manager.count},
                "timestamp": datetime.now().isoformat(),
            })

    def _recalc_device_kpi(self) -> None:
        devs = self.store.devices
        self.store.kpi.online_devices   = sum(1 for d in devs if d.status == "normal")
        self.store.kpi.warning_devices  = sum(1 for d in devs if d.status == "warning")
        self.store.kpi.critical_devices = sum(1 for d in devs if d.status == "critical")
        self.store.kpi.offline_devices  = sum(1 for d in devs if d.status == "offline")
        self.store.kpi.open_alerts      = sum(1 for a in self.store.alerts if a.status == "open")


class DataStore:
    """執行期共用資料倉儲（替代 DB 在 POC 階段）"""

    def __init__(self) -> None:
        from app.mock_data import DEVICES, ALERTS, WORK_ORDERS, KPI
        import copy
        self.devices     = [copy.deepcopy(d) for d in DEVICES]
        self.alerts      = [copy.deepcopy(a) for a in ALERTS]
        self.work_orders = [copy.deepcopy(w) for w in WORK_ORDERS]
        self.kpi         = copy.deepcopy(KPI)
