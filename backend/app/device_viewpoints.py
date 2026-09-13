"""
設備觀看視角（外部配置化）
─────────────────────────────────────────────────────────────────────────────
每台設備自訂的 3D 相機位置 / 注視點存於 `device_viewpoints.json`，所有使用者共用，
沿用 robot_routes.py 的熱加載模式（依 mtime 重載，改檔即生效、免重啟）。
未設定的設備由前端依「預設視角」參數（距離 / 仰角 / 方位角）計算。

設定檔結構：
{
  "version": "1.0",
  "viewpoints": {
    "dev-001": {
      "position":   [-2.1, 12.0, 14.5],   # 相機位置（3D 世界座標）
      "target":     [-8.0, 6.25, 3.0],    # 注視點
      "updated_at": "2026-09-13T17:30:00",
      "updated_by": "admin"
    }
  }
}
"""
import copy
import json
import logging
import math
import os
import threading
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

VIEWPOINTS_PATH = os.getenv(
    "DEVICE_VIEWPOINTS_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "device_viewpoints.json"),
)

MAX_VIEWPOINTS   = 5000
MAX_DEVICE_ID    = 64
COORD_LIMIT      = 5000.0   # 世界座標上限，超出視為輸入錯誤
MIN_VIEW_DIST    = 0.05     # 相機與注視點重合時無法決定方向

_lock = threading.RLock()
_cache: Optional[dict[str, Any]] = None
_cache_mtime: float = 0.0


def _empty() -> dict[str, Any]:
    return {"version": "1.0", "viewpoints": {}}


# ── 驗證 ───────────────────────────────────────────────────────────────────
def _vec3(value: Any, name: str) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError(f"{name} 必須為 [x, y, z]")
    out: list[float] = []
    for v in value:
        try:
            f = float(v)
        except (TypeError, ValueError):
            raise ValueError(f"{name} 含非數值")
        if not math.isfinite(f) or abs(f) > COORD_LIMIT:
            raise ValueError(f"{name} 超出範圍（±{COORD_LIMIT:g}）")
        out.append(round(f, 3))
    return out


def validate_viewpoint(vp: Any) -> dict[str, Any]:
    if not isinstance(vp, dict):
        raise ValueError("視角格式錯誤")
    position = _vec3(vp.get("position"), "position")
    target   = _vec3(vp.get("target"), "target")
    if math.dist(position, target) < MIN_VIEW_DIST:
        raise ValueError("相機位置與注視點不可重合")
    out: dict[str, Any] = {"position": position, "target": target}
    for key in ("updated_at", "updated_by"):
        if isinstance(vp.get(key), str):
            out[key] = vp[key][:64]
    return out


def validate_config(cfg: Any) -> dict[str, Any]:
    if not isinstance(cfg, dict) or not isinstance(cfg.get("viewpoints", {}), dict):
        raise ValueError("設定檔需包含 viewpoints 物件")
    raw = cfg.get("viewpoints", {})
    if len(raw) > MAX_VIEWPOINTS:
        raise ValueError(f"視角數量超過上限 {MAX_VIEWPOINTS}")
    viewpoints = {}
    for device_id, vp in raw.items():
        _check_device_id(device_id)
        try:
            viewpoints[device_id] = validate_viewpoint(vp)
        except ValueError as e:
            raise ValueError(f"{device_id}: {e}")
    return {"version": str(cfg.get("version", "1.0")), "viewpoints": viewpoints}


def _check_device_id(device_id: Any) -> None:
    if not isinstance(device_id, str) or not device_id.strip() or len(device_id) > MAX_DEVICE_ID:
        raise ValueError("device_id 格式錯誤")


# ── 讀寫（熱加載）────────────────────────────────────────────────────────
def _write_unlocked(cfg: dict[str, Any]) -> None:
    """先寫暫存檔再替換，避免寫到一半時被讀到殘缺內容"""
    global _cache_mtime
    tmp = f"{VIEWPOINTS_PATH}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, VIEWPOINTS_PATH)
    try:
        _cache_mtime = os.path.getmtime(VIEWPOINTS_PATH)
    except OSError:
        _cache_mtime = 0.0


def load_config() -> dict[str, Any]:
    """讀取視角設定；檔案 mtime 改變時自動重載。檔案不存在時視為空設定（不自動建檔）"""
    global _cache, _cache_mtime
    with _lock:
        try:
            mtime = os.path.getmtime(VIEWPOINTS_PATH)
        except OSError:
            if _cache is None:
                _cache = _empty()
            return _cache

        if _cache is None or mtime != _cache_mtime:
            try:
                with open(VIEWPOINTS_PATH, "r", encoding="utf-8") as f:
                    cfg = validate_config(json.load(f))
                _cache, _cache_mtime = cfg, mtime
                logger.info("[Viewpoint] 設備視角已載入：%d 台（%s）",
                            len(cfg["viewpoints"]), VIEWPOINTS_PATH)
            except (OSError, json.JSONDecodeError, ValueError) as e:
                logger.warning("[Viewpoint] 設備視角設定無效（%s）→ 沿用前一版設定", e)
                if _cache is None:
                    _cache = _empty()
                _cache_mtime = mtime   # 避免每次請求重複噴同一個錯誤
        return _cache


def save_viewpoint(device_id: str, position: Any, target: Any, updated_by: str = "") -> dict[str, Any]:
    """驗證後寫入單台設備視角；失敗時不動既有檔案"""
    global _cache
    _check_device_id(device_id)
    vp = validate_viewpoint({
        "position": position,
        "target": target,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "updated_by": updated_by,
    })
    with _lock:
        cfg = copy.deepcopy(load_config())
        if device_id not in cfg["viewpoints"] and len(cfg["viewpoints"]) >= MAX_VIEWPOINTS:
            raise ValueError(f"視角數量超過上限 {MAX_VIEWPOINTS}")
        cfg["viewpoints"][device_id] = vp
        _write_unlocked(cfg)
        _cache = cfg
    logger.info("[Viewpoint] %s 視角已更新（%s）", device_id, updated_by or "-")
    return vp


def delete_viewpoint(device_id: str) -> bool:
    """清除單台設備視角；原本就沒有設定時回傳 False"""
    global _cache
    with _lock:
        cfg = copy.deepcopy(load_config())
        if device_id not in cfg["viewpoints"]:
            return False
        del cfg["viewpoints"][device_id]
        _write_unlocked(cfg)
        _cache = cfg
    logger.info("[Viewpoint] %s 視角已清除", device_id)
    return True
