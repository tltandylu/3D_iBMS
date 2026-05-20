"""
AI-DT Enterprise Platform — Phase 1 後端
FastAPI + WebSocket + Mock IoT 模擬器
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.ws_manager import ConnectionManager
from app.iot_simulator import IoTSimulator, DataStore
from app.audit_store import AuditStore
from app.routers import devices, alerts, workorders, ems, audit

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """啟動 / 關閉 lifecycle"""
    store   = DataStore()
    manager = ConnectionManager()
    sim     = IoTSimulator(manager, store)
    audit_s = AuditStore()

    app.state.store   = store
    app.state.manager = manager
    app.state.sim     = sim
    app.state.audit   = audit_s

    # 背景執行 IoT 模擬器
    sim_task = asyncio.create_task(sim.start())
    logger.info("🚀 AI-DT Backend started — IoT simulator running")

    yield  # ── 服務中 ──

    sim_task.cancel()
    try:
        await sim_task
    except asyncio.CancelledError:
        pass
    logger.info("🛑 AI-DT Backend stopped")


app = FastAPI(
    title="AI-DT Enterprise Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — 允許所有本機 dev server 埠號
_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
    "http://localhost:5175", "http://127.0.0.1:5175",
    "http://localhost:5176", "http://127.0.0.1:5176",
    "http://localhost:3000", "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST 路由
app.include_router(devices.router)
app.include_router(alerts.router)
app.include_router(workorders.router)
app.include_router(ems.router)
app.include_router(audit.router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "connected_clients": app.state.manager.count,
        "devices": len(app.state.store.devices),
        "alerts": len(app.state.store.alerts),
    }


# ── WebSocket 端點 ──────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    manager: ConnectionManager = ws.app.state.manager
    store: DataStore            = ws.app.state.store

    await manager.connect(ws)

    # 連線後立即推送完整初始快照
    await manager.send_to(ws, {
        "type": "snapshot",
        "payload": {
            "devices":     [d.model_dump() for d in store.devices],
            "alerts":      [a.model_dump() for a in store.alerts],
            "work_orders": [w.model_dump() for w in store.work_orders],
            "kpi":         store.kpi.model_dump(),
        },
        "timestamp": __import__("datetime").datetime.now().isoformat(),
    })

    try:
        while True:
            # 等待客戶端訊息（ping / 指令）
            data = await ws.receive_text()
            import json
            msg = json.loads(data)

            if msg.get("type") == "ping":
                await manager.send_to(ws, {"type": "pong", "payload": {}})

            elif msg.get("type") == "acknowledge_alert":
                alert_id = msg.get("payload", {}).get("alert_id")
                alert = next((a for a in store.alerts if a.id == alert_id), None)
                if alert:
                    alert.status = "acknowledged"
                    store.kpi.open_alerts = max(0, store.kpi.open_alerts - 1)
                    await manager.broadcast({
                        "type": "alert_update",
                        "payload": {"id": alert_id, "status": "acknowledged"},
                        "timestamp": __import__("datetime").datetime.now().isoformat(),
                    })
                    ws.app.state.audit.add(
                        'alert_acknowledge',
                        device_id=alert.asset_id, device_name=alert.asset_name,
                        command='acknowledge', result='success',
                        message=f"確認告警：{alert.title}",
                    )

            elif msg.get("type") == "update_workorder_status":
                import datetime as _dt
                p   = msg.get("payload", {})
                wo_id  = p.get("id")
                status = p.get("status")
                wo = next((w for w in store.work_orders if w.id == wo_id), None)
                if wo and status in {"pending", "in_progress", "completed"}:
                    old = wo.status
                    wo.status = status  # type: ignore[assignment]
                    kpi = store.kpi
                    if old == "pending" and status == "in_progress":
                        kpi.pending_work_orders = max(0, kpi.pending_work_orders - 1)
                        kpi.in_progress_work_orders += 1
                    elif old == "in_progress" and status == "completed":
                        kpi.in_progress_work_orders = max(0, kpi.in_progress_work_orders - 1)
                        kpi.today_completed_work_orders += 1
                    await manager.broadcast({
                        "type": "workorder_update",
                        "payload": {"id": wo_id, "status": status},
                        "timestamp": _dt.datetime.now().isoformat(),
                    })

            elif msg.get("type") == "create_workorder":
                import datetime as _dt
                from app.models import WorkOrder as WOModel
                p = msg.get("payload", {})
                new_wo = WOModel(
                    id=p.get("id", f"wo-ws-{int(_dt.datetime.now().timestamp()*1000)}"),
                    wo_number=p.get("wo_number", f"WO-{int(_dt.datetime.now().timestamp())%1000000:06d}"),
                    wo_type=p.get("wo_type", "CM"),
                    title=p.get("title", ""),
                    priority=p.get("priority", "MEDIUM"),
                    status="pending",
                    asset_id=p.get("asset_id", ""),
                    asset_name=p.get("asset_name", ""),
                    assigned_to=p.get("assigned_to") or None,
                    estimated_hours=float(p.get("estimated_hours", 2)),
                    created_at=_dt.datetime.now().isoformat(),
                    ai_root_cause=p.get("ai_root_cause") or None,
                )
                store.work_orders.insert(0, new_wo)
                store.kpi.pending_work_orders += 1
                await manager.broadcast({
                    "type": "workorder_new",
                    "payload": new_wo.model_dump(),
                    "timestamp": _dt.datetime.now().isoformat(),
                })

    except WebSocketDisconnect:
        manager.disconnect(ws)
