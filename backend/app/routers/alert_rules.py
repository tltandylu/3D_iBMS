"""告警規則 CRUD API"""
import uuid
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import require_roles, get_current_user
from app.db.session import get_db
from app.db.repository import DBRepository

router = APIRouter(prefix="/api/alert-rules", tags=["alert-rules"])

_VALID_METRICS   = {"power", "temperature", "aiScore", "rulDays"}
_VALID_OPERATORS = {">", "<", ">=", "<="}
_VALID_SEVERITIES = {"INFO", "WARNING", "ALARM", "CRITICAL"}


class AlertRuleBody(BaseModel):
    name:      str              = Field(min_length=1, max_length=200)
    device_id: str              = "*"
    metric:    Literal["power", "temperature", "aiScore", "rulDays"] = "power"
    operator:  Literal[">", "<", ">=", "<="]                         = ">"
    threshold: float
    severity:  Literal["INFO", "WARNING", "ALARM", "CRITICAL"]       = "WARNING"
    enabled:   bool             = True


class PatchRuleBody(BaseModel):
    name:      Optional[str]   = None
    device_id: Optional[str]   = None
    metric:    Optional[str]   = None
    operator:  Optional[str]   = None
    threshold: Optional[float] = None
    severity:  Optional[str]   = None
    enabled:   Optional[bool]  = None


# ── 列出所有規則（任意已登入使用者）────────────────────────────────────────────

@router.get("")
async def list_rules(
    db: DBRepository = Depends(get_db),
    _:  dict         = Depends(require_roles("admin", "operator", "viewer")),
):
    return await db.list_alert_rules()


# ── 批次同步（前端上傳完整規則列表）────────────────────────────────────────────

@router.put("/sync")
async def sync_rules(
    rules: list[AlertRuleBody],
    db:    DBRepository = Depends(get_db),
    user:  dict         = Depends(require_roles("admin", "operator")),
):
    """前端 localStorage 規則一次性上傳至後端（首次登入時同步）"""
    existing = {r["id"] for r in await db.list_alert_rules()}
    for idx, rule in enumerate(rules):
        rule_id = f"rule-sync-{idx}-{int(datetime.now().timestamp())}"
        await db.upsert_alert_rule({
            "id":         rule_id,
            "name":       rule.name,
            "device_id":  rule.device_id,
            "metric":     rule.metric,
            "operator":   rule.operator,
            "threshold":  rule.threshold,
            "severity":   rule.severity,
            "enabled":    rule.enabled,
            "created_at": datetime.now().isoformat(),
            "created_by": user.get("username", ""),
        })
    return {"message": f"已同步 {len(rules)} 條規則"}


# ── 新增規則 ─────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_rule(
    body: AlertRuleBody,
    db:   DBRepository = Depends(get_db),
    user: dict         = Depends(require_roles("admin", "operator")),
):
    rule_id = f"rule-{uuid.uuid4().hex[:12]}"
    rule = {
        "id":         rule_id,
        "name":       body.name,
        "device_id":  body.device_id,
        "metric":     body.metric,
        "operator":   body.operator,
        "threshold":  body.threshold,
        "severity":   body.severity,
        "enabled":    body.enabled,
        "created_at": datetime.now().isoformat(),
        "created_by": user.get("username", ""),
    }
    await db.upsert_alert_rule(rule)
    return rule


# ── 更新規則 ─────────────────────────────────────────────────────────────────

@router.patch("/{rule_id}")
async def update_rule(
    rule_id: str,
    body:    PatchRuleBody,
    db:      DBRepository = Depends(get_db),
    _:       dict         = Depends(require_roles("admin", "operator")),
):
    rules = await db.list_alert_rules()
    existing = next((r for r in rules if r["id"] == rule_id), None)
    if not existing:
        raise HTTPException(404, "規則不存在")
    patch = body.model_dump(exclude_none=True)
    if "metric"   in patch and patch["metric"]   not in _VALID_METRICS:
        raise HTTPException(400, "無效的 metric")
    if "operator" in patch and patch["operator"] not in _VALID_OPERATORS:
        raise HTTPException(400, "無效的 operator")
    if "severity" in patch and patch["severity"] not in _VALID_SEVERITIES:
        raise HTTPException(400, "無效的 severity")
    updated = {**existing, **patch}
    await db.upsert_alert_rule(updated)
    return updated


# ── 啟用/停用切換 ──────────────────────────────────────────────────────────────

@router.patch("/{rule_id}/toggle")
async def toggle_rule(
    rule_id: str,
    db:      DBRepository = Depends(get_db),
    _:       dict         = Depends(require_roles("admin", "operator")),
):
    result = await db.toggle_alert_rule(rule_id)
    if not result:
        raise HTTPException(404, "規則不存在")
    return result


# ── 刪除規則 ─────────────────────────────────────────────────────────────────

@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: str,
    db:      DBRepository = Depends(get_db),
    _:       dict         = Depends(require_roles("admin", "operator")),
):
    await db.delete_alert_rule(rule_id)
