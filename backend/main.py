"""
AI-DT Enterprise Platform — Phase 20
FastAPI + WebSocket + Mock IoT 模擬器 + PostgreSQL/MSSQL 持久化
Alembic 資料庫遷移管理（USE_ALEMBIC=1 啟用）
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from jose import JWTError
from app.limiter import limiter
from app.auth import decode_token

from app.ws_manager import ConnectionManager
from app.iot_simulator import IoTSimulator, DataStore
from app.audit_store import AuditStore
from app.routers import devices, alerts, workorders, ems, audit, auth as auth_router
from app.routers import push as push_router
from app.routers import users as users_router
from app.routers import notifications as notifications_router
from app.routers import webhook as webhook_router
from app.routers import export as export_router
from app.routers import alert_rules as alert_rules_router
from app.routers import reports as reports_router
from app.routers import shift_logs as shift_logs_router
from app.routers import inspections as inspections_router
from app.routers import spare_parts as spare_parts_router
from app.routers import point_bindings as point_bindings_router
from app.push_service import load_or_generate_keys
from app.db.engine import engine, AsyncSessionLocal
from app.db.models import Base
from app.db.repository import DBRepository

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 資料表初始化 ───────────────────────────────────────────
    # USE_ALEMBIC=1 → 由 entrypoint.sh 的 `alembic upgrade head` 管理（生產）
    # USE_ALEMBIC=0 → SQLAlchemy create_all（開發快速啟動，預設）
    if os.getenv("USE_ALEMBIC", "0") != "1":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[DB] 資料表初始化完成（create_all 模式）")
    else:
        logger.info("[DB] Alembic 模式：資料表由 entrypoint.sh 管理")

    # ── VAPID 金鑰（Web Push）────────────────────────────────
    vapid_private, vapid_public = load_or_generate_keys()
    app.state.vapid_private_key = vapid_private
    app.state.vapid_public_key  = vapid_public
    logger.info("[Push] VAPID public key: %s…", vapid_public[:24])

    # ── Seed 預設使用者（首次啟動）────────────────────────────
    from app.auth import hash_password
    from datetime import datetime as _dt2
    _DEFAULT_USERS = [
        {"id": "u1", "username": "admin@ibms.com",    "name": "系統管理員",
         "password": "admin123",    "role": "admin",    "avatar_color": "#ef4444"},
        {"id": "u2", "username": "operator@ibms.com", "name": "設備操作員",
         "password": "operator123", "role": "operator", "avatar_color": "#f59e0b"},
        {"id": "u3", "username": "viewer@ibms.com",   "name": "資料檢視者",
         "password": "viewer123",   "role": "viewer",   "avatar_color": "#10b981"},
    ]
    async with AsyncSessionLocal() as session:
        repo = DBRepository(session)
        if await repo.user_count() == 0:
            for u in _DEFAULT_USERS:
                await repo.create_user(
                    user_id=u["id"], username=u["username"], name=u["name"],
                    hashed_password=hash_password(u["password"]),
                    role=u["role"], avatar_color=u["avatar_color"],
                    created_at=_dt2.now().isoformat(),
                )
            logger.info("[DB] 預設使用者已建立（admin / operator / viewer）")

    # ── 清理過期設備指標（保留 7 天）────────────────────────
    async with AsyncSessionLocal() as session:
        repo = DBRepository(session)
        pruned = await repo.prune_old_metrics(days=7)
        if pruned > 0:
            logger.info(f"[DB] 清理過期設備指標 {pruned} 筆")

    # ── 清理過期站內通知（保留 30 天）───────────────────────
    async with AsyncSessionLocal() as session:
        repo = DBRepository(session)
        pruned_n = await repo.prune_old_notifications(days=30)
        if pruned_n > 0:
            logger.info(f"[DB] 清理過期站內通知 {pruned_n} 筆")

    store   = DataStore()
    manager = ConnectionManager()
    audit_s = AuditStore()

    # ── 從 DB 載入持久化資料覆蓋 mock 初始值 ─────────────────
    async with AsyncSessionLocal() as session:
        repo = DBRepository(session)
        db_alerts = await repo.get_alerts(limit=50)
        db_wos    = await repo.get_workorders()

    if db_alerts:
        store.alerts = db_alerts
        logger.info(f"[DB] 載入 {len(db_alerts)} 筆告警")
    else:
        # 首次啟動：將 mock 初始告警持久化到 DB
        async with AsyncSessionLocal() as session:
            repo = DBRepository(session)
            for a in store.alerts:
                await repo.upsert_alert(a)
        logger.info(f"[DB] 初始化 {len(store.alerts)} 筆告警至 DB")

    if db_wos:
        store.work_orders = db_wos
        logger.info(f"[DB] 載入 {len(db_wos)} 筆工單")
    else:
        async with AsyncSessionLocal() as session:
            repo = DBRepository(session)
            for wo in store.work_orders:
                await repo.upsert_workorder(wo)
        logger.info(f"[DB] 初始化 {len(store.work_orders)} 筆工單至 DB")

    # 讓 IoT 模擬器可存取 DB session factory
    sim = IoTSimulator(
        manager, store,
        session_factory=AsyncSessionLocal,
        vapid_private_key=vapid_private,
    )

    app.state.store              = store
    app.state.manager            = manager
    app.state.audit              = audit_s
    app.state.session_factory    = AsyncSessionLocal
    app.state.simulator          = sim

    sim_task = asyncio.create_task(sim.start())

    from app.scheduler import run_report_scheduler
    sched_task = asyncio.create_task(run_report_scheduler(app.state))

    async def _persist_point_values():
        """每 60 秒將點位即時值寫入 DB（point_realtime_values）"""
        from datetime import datetime as _dt
        while True:
            await asyncio.sleep(60)
            try:
                async with AsyncSessionLocal() as _sess:
                    _repo = DBRepository(_sess)
                    await _repo.upsert_point_realtime_values(
                        dict(sim._point_values), _dt.now().isoformat()
                    )
            except Exception as _e:
                logger.warning(f"[DB] 點位即時值持久化失敗: {_e}")

    persist_task = asyncio.create_task(_persist_point_values())
    logger.info("🚀 AI-DT Backend started — IoT simulator + report scheduler + point-value persistence running")

    yield  # ── 服務中 ──

    for task in (sim_task, sched_task, persist_task):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    await engine.dispose()
    logger.info("🛑 AI-DT Backend stopped")


app = FastAPI(
    title="AI-DT Enterprise Platform API",
    version="2.0.0",
    lifespan=lifespan,
)

# ── Rate Limiting ──────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── Security Headers ───────────────────────────────────────────────────────
class _SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(_SecurityHeadersMiddleware)

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
app.include_router(auth_router.router)
app.include_router(push_router.router)
app.include_router(users_router.router)
app.include_router(devices.router)
app.include_router(alerts.router)
app.include_router(workorders.router)
app.include_router(ems.router)
app.include_router(audit.router)
app.include_router(notifications_router.router)
app.include_router(webhook_router.router)
app.include_router(export_router.router)
app.include_router(alert_rules_router.router)
app.include_router(reports_router.router)
app.include_router(shift_logs_router.router)
app.include_router(inspections_router.router)
app.include_router(spare_parts_router.router)
app.include_router(point_bindings_router.router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "connected_clients": app.state.manager.count,
        "devices": len(app.state.store.devices),
        "alerts": len(app.state.store.alerts),
    }


# ── WebSocket 端點 ──────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(default="")):
    manager: ConnectionManager = ws.app.state.manager
    store: DataStore            = ws.app.state.store

    # ── 選用 JWT 驗證（有 token 則驗，無 token 允許匿名連線）──────────────
    ws_username: str | None = None
    if token:
        try:
            payload = decode_token(token)
            ws_username = payload.get("sub")
        except JWTError:
            await ws.close(code=4001, reason="Invalid token")
            return

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
                    # 持久化到 DB
                    async with ws.app.state.session_factory() as db_session:
                        repo = DBRepository(db_session)
                        await repo.update_alert_status(alert_id, "acknowledged")
                    ts = __import__("datetime").datetime.now().isoformat()
                    ws.app.state.audit.add(
                        "alert_acknowledge",
                        device_id=alert.asset_id, device_name=alert.asset_name,
                        command="acknowledge", result="success",
                        message=f"確認告警：{alert.title}",
                    )
                    await manager.broadcast({
                        "type": "alert_update",
                        "payload": {"id": alert_id, "status": "acknowledged"},
                        "timestamp": ts,
                    })

            elif msg.get("type") == "update_workorder_status":
                import datetime as _dt
                p      = msg.get("payload", {})
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
                    # 持久化到 DB
                    async with ws.app.state.session_factory() as db_session:
                        repo = DBRepository(db_session)
                        await repo.update_workorder_status(wo_id, status)
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
                # 持久化到 DB
                async with ws.app.state.session_factory() as db_session:
                    repo = DBRepository(db_session)
                    await repo.upsert_workorder(new_wo)
                await manager.broadcast({
                    "type": "workorder_new",
                    "payload": new_wo.model_dump(),
                    "timestamp": _dt.datetime.now().isoformat(),
                })

    except WebSocketDisconnect:
        manager.disconnect(ws)
