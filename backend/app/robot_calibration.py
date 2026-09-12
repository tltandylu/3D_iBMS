"""
機器人坐標系校準（規格書 §5）
─────────────────────────────────────────────────────────────────────────────
* §5.1  ROS 原生坐標（x 前、y 左、z 上）→ Three.js 世界坐標（x 右、y 上、z 後）
* §5.2  以 4×4 齊次矩陣 M_align 表達：M = T · R_yaw · S · A
        A 為軸向轉換（ROS → Three），S 為比例尺，R_yaw 為水平偏角修正，T 為平移
* §5.3  以現場錨點對（≥3 點）最小平方求解剛體轉換，輸出 RMSE；
        參數存於 calibration_profiles.json，支援熱加載（依 mtime 重載，免重啟）

求解採 Umeyama 相似轉換在水平面的封閉解（yaw + 均勻縮放 + 平移），
對應規格 §5.2「主要為 Yaw 軸偏角」之現場情境；垂直方向以錨點高程均值對齊。
不依賴 numpy/scipy，維持後端相依最小化。
"""
import json
import logging
import math
import os
import threading
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

CALIB_PATH = os.getenv(
    "ROBOT_CALIBRATION_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "calibration_profiles.json"),
)

# 樂迦大樓：樓高 2.5m。此處為「樓板高程」（機器人接地面），
# 對應 mockData 設備坐標的樓層中心再減去半層高（1FL 樓板 y=0）
DEFAULT_FLOOR_ELEVATIONS: dict[str, float] = {
    "B2": -5.0, "B1": -2.5,
    **{f"FL-{i:02d}": (i - 1) * 2.5 for i in range(1, 13)},
}

_lock = threading.Lock()
_cache: Optional[dict[str, Any]] = None
_cache_mtime: float = 0.0


# ── 軸向轉換 A：ROS(x 前, y 左, z 上) → Three(x 右, y 上, z 後) ──────────────
# three.x = ros.x   three.y = ros.z   three.z = -ros.y
_AXIS_ROS_TO_THREE = ((1.0, 0.0, 0.0),
                      (0.0, 0.0, 1.0),
                      (0.0, -1.0, 0.0))
# 無軸向轉換（資料源已是 Three 坐標慣例）
_AXIS_IDENTITY = ((1.0, 0.0, 0.0),
                  (0.0, 1.0, 0.0),
                  (0.0, 0.0, 1.0))

AXIS_CONVENTIONS = {"ROS_ZUP": _AXIS_ROS_TO_THREE, "THREE_YUP": _AXIS_IDENTITY}


def axis_matrix(convention: str) -> tuple[tuple[float, float, float], ...]:
    return AXIS_CONVENTIONS.get(convention, _AXIS_ROS_TO_THREE)


def apply_axis(a: tuple[tuple[float, float, float], ...],
               p: tuple[float, float, float]) -> tuple[float, float, float]:
    return (
        a[0][0] * p[0] + a[0][1] * p[1] + a[0][2] * p[2],
        a[1][0] * p[0] + a[1][1] * p[1] + a[1][2] * p[2],
        a[2][0] * p[0] + a[2][1] * p[1] + a[2][2] * p[2],
    )


def build_matrix(translation: list[float], yaw_deg: float, scale: float,
                 convention: str = "ROS_ZUP") -> list[float]:
    """組出 M = T · R_yaw · S · A，回傳 column-major 16 元素陣列
    （對應前端 THREE.Matrix4.fromArray）"""
    a  = axis_matrix(convention)
    c  = math.cos(math.radians(yaw_deg))
    s  = math.sin(math.radians(yaw_deg))
    # 繞 Three 的 Y（上）軸旋轉
    r  = ((c, 0.0, s),
          (0.0, 1.0, 0.0),
          (-s, 0.0, c))
    # M3 = R · (scale · A)
    m3 = [[sum(r[i][k] * scale * a[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    t  = list(translation) + [0.0, 0.0, 0.0]
    # column-major：e[col*4 + row]
    e = [0.0] * 16
    for col in range(3):
        for row in range(3):
            e[col * 4 + row] = m3[row][col]
    e[12], e[13], e[14] = t[0], t[1], t[2]
    e[15] = 1.0
    return [round(v, 9) for v in e]


def transform_point(p: tuple[float, float, float], translation: list[float],
                    yaw_deg: float, scale: float,
                    convention: str = "ROS_ZUP") -> tuple[float, float, float]:
    """單點套用校準轉換（與 build_matrix 等價，供 RMSE 計算使用）"""
    ax, ay, az = apply_axis(axis_matrix(convention), p)
    c = math.cos(math.radians(yaw_deg))
    s = math.sin(math.radians(yaw_deg))
    return (
        scale * (c * ax + s * az) + translation[0],
        scale * ay + translation[1],
        scale * (-s * ax + c * az) + translation[2],
    )


# ── §5.3 錨點求解（水平相似轉換封閉解 + 垂直對齊）──────────────────────────
def solve_alignment(anchors: list[dict[str, Any]],
                    convention: str = "ROS_ZUP",
                    fixed_scale: Optional[float] = None) -> dict[str, Any]:
    """anchors: [{name, robot:[x,y,z], world:[x,y,z]}, ...]（robot 為原生坐標）

    回傳 {translation, yaw_deg, scale, rmse_m, max_error_m, residuals}
    """
    if len(anchors) < 3:
        raise ValueError("至少需要 3 組錨點才能求解剛體轉換（規格 §5.3）")

    a_mat = axis_matrix(convention)
    src: list[tuple[float, float, float]] = []
    dst: list[tuple[float, float, float]] = []
    for an in anchors:
        r = an.get("robot") or []
        w = an.get("world") or []
        if len(r) < 3 or len(w) < 3:
            raise ValueError(f"錨點 {an.get('name', '?')} 的 robot / world 坐標需為三維")
        src.append(apply_axis(a_mat, (float(r[0]), float(r[1]), float(r[2]))))
        dst.append((float(w[0]), float(w[1]), float(w[2])))

    n = len(src)
    mx = sum(p[0] for p in src) / n
    my = sum(p[1] for p in src) / n
    mz = sum(p[2] for p in src) / n
    qx = sum(p[0] for p in dst) / n
    qy = sum(p[1] for p in dst) / n
    qz = sum(p[2] for p in dst) / n

    # 水平面（x-z）上求 yaw：tanθ = -Σ(ax·qz - az·qx) / Σ(ax·qx + az·qz)
    num = 0.0   # Σ(ax·qz - az·qx)
    den = 0.0   # Σ(ax·qx + az·qz)
    ssq = 0.0   # Σ(ax² + az²)
    for p, q in zip(src, dst):
        ax, az = p[0] - mx, p[2] - mz
        bx, bz = q[0] - qx, q[2] - qz
        num += ax * bz - az * bx
        den += ax * bx + az * bz
        ssq += ax * ax + az * az
    if ssq < 1e-12:
        raise ValueError("錨點在水平面上退化為單點，無法求解旋轉")

    yaw = math.degrees(math.atan2(-num, den))
    c, s = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))

    if fixed_scale is not None:
        scale = float(fixed_scale)
    else:
        acc = 0.0
        for p, q in zip(src, dst):
            ax, az = p[0] - mx, p[2] - mz
            bx, bz = q[0] - qx, q[2] - qz
            acc += bx * (c * ax + s * az) + bz * (-s * ax + c * az)
        scale = acc / ssq
        if scale <= 0:
            raise ValueError("求得的比例尺為非正值，請檢查錨點對應是否錯置")

    translation = [
        qx - scale * (c * mx + s * mz),
        qy - scale * my,
        qz - scale * (-s * mx + c * mz),
    ]

    residuals = []
    sq_sum = 0.0
    max_err = 0.0
    for an, p, q in zip(anchors, src, dst):
        fit = (
            scale * (c * p[0] + s * p[2]) + translation[0],
            scale * p[1] + translation[1],
            scale * (-s * p[0] + c * p[2]) + translation[2],
        )
        err = math.dist(fit, q)
        sq_sum += err * err
        max_err = max(max_err, err)
        residuals.append({"name": an.get("name", ""), "error_m": round(err, 4)})

    return {
        "translation": [round(v, 6) for v in translation],
        "yaw_deg": round(yaw, 4),
        "scale": round(scale, 6),
        "rmse_m": round(math.sqrt(sq_sum / n), 4),
        "max_error_m": round(max_err, 4),
        "residuals": residuals,
    }


# ── 設定檔存取（熱加載）────────────────────────────────────────────────────
def _default_config() -> dict[str, Any]:
    profile = {
        "profile_id": "locus-default",
        "name": "樂迦大樓 · AMR 導航地圖",
        "site_id": "locus",
        "axis_convention": "ROS_ZUP",
        "translation": [0.0, 0.0, 0.0],
        "yaw_deg": 0.0,
        "scale": 1.0,
        "rmse_m": 0.0,
        "anchors": [
            {"name": "B2 充電樁定位銷", "robot": [-10.5, -7.5, 0.0], "world": [-10.5, 0.0, 7.5]},
            {"name": "西南柱體邊角",    "robot": [-9.0, -6.0, 0.0],  "world": [-9.0, 0.0, 6.0]},
            {"name": "東北防火門框",    "robot": [9.0, 6.0, 0.0],    "world": [9.0, 0.0, -6.0]},
        ],
        "floor_elevations": DEFAULT_FLOOR_ELEVATIONS,
        "updated_at": datetime.now().isoformat(),
    }
    profile["matrix"] = build_matrix(profile["translation"], profile["yaw_deg"],
                                     profile["scale"], profile["axis_convention"])
    return {"active_profile_id": profile["profile_id"], "profiles": [profile]}


def _normalize(cfg: dict[str, Any]) -> dict[str, Any]:
    """補齊缺漏欄位並重算矩陣，確保 matrix 與參數永遠一致"""
    profiles = cfg.get("profiles") or []
    for p in profiles:
        p.setdefault("axis_convention", "ROS_ZUP")
        p.setdefault("translation", [0.0, 0.0, 0.0])
        p.setdefault("yaw_deg", 0.0)
        p.setdefault("scale", 1.0)
        p.setdefault("anchors", [])
        p.setdefault("rmse_m", 0.0)
        p.setdefault("floor_elevations", DEFAULT_FLOOR_ELEVATIONS)
        p["matrix"] = build_matrix(p["translation"], p["yaw_deg"], p["scale"],
                                   p["axis_convention"])
    if not profiles:
        return _default_config()
    if cfg.get("active_profile_id") not in {p["profile_id"] for p in profiles}:
        cfg["active_profile_id"] = profiles[0]["profile_id"]
    return cfg


def load_config(force: bool = False) -> dict[str, Any]:
    """讀取校準設定；檔案 mtime 改變時自動重載（§5.3 熱加載）"""
    global _cache, _cache_mtime
    with _lock:
        try:
            mtime = os.path.getmtime(CALIB_PATH)
        except OSError:
            if _cache is None or force:
                _cache = _default_config()
                _cache_mtime = 0.0
                _write_unlocked(_cache)
            return _cache

        if _cache is None or force or mtime != _cache_mtime:
            try:
                with open(CALIB_PATH, "r", encoding="utf-8") as f:
                    _cache = _normalize(json.load(f))
                _cache_mtime = mtime
                logger.info("[Robot] 校準設定已載入：%s", CALIB_PATH)
            except (OSError, json.JSONDecodeError) as e:
                logger.warning("[Robot] 校準設定讀取失敗（%s），改用預設值", e)
                _cache = _default_config()
                _cache_mtime = 0.0
        return _cache


def _write_unlocked(cfg: dict[str, Any]) -> None:
    global _cache_mtime
    with open(CALIB_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    try:
        _cache_mtime = os.path.getmtime(CALIB_PATH)
    except OSError:
        _cache_mtime = 0.0


def save_profile(profile: dict[str, Any], set_active: bool = True) -> dict[str, Any]:
    """新增或覆寫單一 profile 並寫回 JSON"""
    global _cache
    cfg = json.loads(json.dumps(load_config()))   # deep copy，避免半途失敗污染快取
    profiles = cfg.setdefault("profiles", [])
    pid = profile.get("profile_id") or "profile-1"
    profile["profile_id"] = pid
    profile["updated_at"] = datetime.now().isoformat()
    for i, p in enumerate(profiles):
        if p.get("profile_id") == pid:
            profiles[i] = {**p, **profile}
            break
    else:
        profiles.append(profile)
    if set_active:
        cfg["active_profile_id"] = pid
    cfg = _normalize(cfg)
    with _lock:
        _write_unlocked(cfg)
        _cache = cfg
    return cfg


def active_profile() -> dict[str, Any]:
    cfg = load_config()
    pid = cfg.get("active_profile_id")
    for p in cfg.get("profiles", []):
        if p.get("profile_id") == pid:
            return p
    return cfg["profiles"][0]
