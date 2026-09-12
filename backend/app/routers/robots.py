"""AMR / AGV 車隊路由 — /api/robots

* GET  /api/robots                      車隊即時快照（REST 補位，WS 中斷時前端可輪詢）
* GET  /api/robots/calibration          坐標校準設定（§5.3 熱加載）
* POST /api/robots/calibration/solve    錨點最小平方求解（不寫檔，供現場試算）
* PUT  /api/robots/calibration          寫入 / 切換校準 profile（admin）
* POST /api/robots/telemetry            外部 MQTT / ROSBridge 閘道注入真實遙測
* GET  /api/robots/{device_id}          單台機器人快照
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import require_roles
from app import robot_calibration as calib
from app.robot_simulator import MAX_PLAUSIBLE_SPEED, TELEMETRY_HZ

router = APIRouter(prefix="/api/robots", tags=["robots"])


# ── Schemas ────────────────────────────────────────────────────────────────
class Anchor(BaseModel):
    name: str = ""
    robot: list[float] = Field(..., min_length=3, max_length=3)
    world: list[float] = Field(..., min_length=3, max_length=3)


class SolveRequest(BaseModel):
    anchors: list[Anchor]
    axis_convention: str = "ROS_ZUP"
    fixed_scale: Optional[float] = None


class ProfilePayload(BaseModel):
    profile_id: str = "locus-default"
    name: str = "未命名 profile"
    site_id: str = "locus"
    axis_convention: str = "ROS_ZUP"
    translation: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    yaw_deg: float = 0.0
    scale: float = 1.0
    rmse_m: float = 0.0
    anchors: list[Anchor] = Field(default_factory=list)
    floor_elevations: Optional[dict[str, float]] = None
    set_active: bool = True


def _fleet(request: Request):
    fleet = getattr(request.app.state, "robot_fleet", None)
    if fleet is None:
        raise HTTPException(503, "車隊遙測服務尚未啟動")
    return fleet


# ── 車隊快照 ───────────────────────────────────────────────────────────────
@router.get("")
async def list_robots(
    request: Request,
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
) -> dict[str, Any]:
    fleet = _fleet(request)
    return {
        "robots": fleet.snapshot(),
        "telemetry_hz": TELEMETRY_HZ,
        "max_speed_limit": MAX_PLAUSIBLE_SPEED,
        "source": "external" if fleet.external_mode else "simulator",
    }


# ── 校準設定（§5.3）─────────────────────────────────────────────────────────
@router.get("/calibration")
async def get_calibration(
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
) -> dict[str, Any]:
    cfg = calib.load_config()
    return {**cfg, "active": calib.active_profile()}


@router.post("/calibration/solve")
async def solve_calibration(
    body: SolveRequest,
    _: dict = Depends(require_roles("admin", "operator")),
) -> dict[str, Any]:
    try:
        result = calib.solve_alignment(
            [a.model_dump() for a in body.anchors],
            convention=body.axis_convention,
            fixed_scale=body.fixed_scale,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    result["matrix"] = calib.build_matrix(
        result["translation"], result["yaw_deg"], result["scale"], body.axis_convention
    )
    result["accuracy_pass"] = result["rmse_m"] <= 0.15   # §2.2 KPI：RMSE ≤ 0.15 m
    return result


@router.put("/calibration")
async def put_calibration(
    body: ProfilePayload,
    _: dict = Depends(require_roles("admin")),
) -> dict[str, Any]:
    payload = body.model_dump(exclude={"set_active"})
    payload["anchors"] = [a if isinstance(a, dict) else a.model_dump() for a in payload["anchors"]]
    if payload.get("floor_elevations") is None:
        payload.pop("floor_elevations")
    cfg = calib.save_profile(payload, set_active=body.set_active)
    return {**cfg, "active": calib.active_profile()}


# ── 外部真實遙測注入 ────────────────────────────────────────────────────────
@router.post("/telemetry")
async def ingest_telemetry(
    packet: dict[str, Any],
    request: Request,
    _: dict = Depends(require_roles("admin", "operator")),
) -> dict[str, Any]:
    result = await _fleet(request).ingest_external(packet)
    if not result.get("accepted"):
        raise HTTPException(422, result.get("reason", "封包驗證失敗"))
    return result


@router.get("/{device_id}")
async def get_robot(
    device_id: str,
    request: Request,
    _: dict = Depends(require_roles("admin", "operator", "viewer")),
) -> dict[str, Any]:
    robot = _fleet(request).get(device_id)
    if robot is None:
        raise HTTPException(404, f"機器人 {device_id} 不存在")
    return robot
