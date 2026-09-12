"""Email SMTP 告警通知服務（aiosmtplib 非同步）"""
import os
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

logger = logging.getLogger(__name__)

# ── 環境變數配置 ───────────────────────────────────────────────
SMTP_HOST     = os.getenv("SMTP_HOST", "")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM", SMTP_USER)
SMTP_TO       = os.getenv("SMTP_TO", "")       # 逗號分隔收件人
SMTP_TLS      = os.getenv("SMTP_TLS", "starttls").lower()  # starttls | ssl | none


def is_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_TO)


def get_recipients() -> list[str]:
    return [r.strip() for r in SMTP_TO.split(",") if r.strip()]


def _build_html(severity: str, asset_name: str, title: str,
                description: str, occurred_at: str, alert_id: str) -> str:
    sev_color = {
        "CRITICAL": "#ef4444",
        "ALARM":    "#f97316",
        "WARNING":  "#f59e0b",
        "INFO":     "#06b6d4",
    }.get(severity, "#94a3b8")

    return f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background:#0f172a; margin:0; padding:24px; color:#e2e8f0; }}
  .card {{ max-width:560px; margin:0 auto; background:#1e293b; border-radius:12px;
           border:1px solid rgba(255,255,255,0.08); overflow:hidden; }}
  .header {{ background:{sev_color}22; border-bottom:3px solid {sev_color};
             padding:18px 24px; display:flex; align-items:center; gap:12px; }}
  .badge {{ background:{sev_color}; color:#fff; font-size:11px; font-weight:700;
            padding:3px 10px; border-radius:20px; letter-spacing:0.5px; }}
  .body {{ padding:20px 24px; }}
  .row {{ display:flex; gap:8px; margin-bottom:10px; }}
  .label {{ color:#94a3b8; font-size:12px; min-width:72px; }}
  .value {{ color:#f1f5f9; font-size:13px; }}
  .footer {{ padding:12px 24px; border-top:1px solid rgba(255,255,255,0.06);
             font-size:11px; color:#64748b; text-align:right; }}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <span style="font-size:20px">🚨</span>
    <div>
      <div style="font-size:15px;font-weight:600;margin-bottom:4px">智慧設施告警通知</div>
      <span class="badge">{severity}</span>
    </div>
  </div>
  <div class="body">
    <div class="row"><span class="label">設備</span><span class="value">{asset_name}</span></div>
    <div class="row"><span class="label">告警標題</span><span class="value">{title}</span></div>
    <div class="row"><span class="label">描述</span><span class="value">{description}</span></div>
    <div class="row"><span class="label">發生時間</span><span class="value">{occurred_at}</span></div>
    <div class="row"><span class="label">告警 ID</span><span class="value" style="color:#64748b;font-size:11px">{alert_id}</span></div>
  </div>
  <div class="footer">AI-DT Enterprise Platform · 3D 智慧設施監控管理平台</div>
</div>
</body>
</html>"""


async def send_alert_email(
    severity:    str,
    asset_name:  str,
    title:       str,
    description: str,
    occurred_at: str,
    alert_id:    str,
) -> None:
    if not is_configured():
        return

    recipients = get_recipients()
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"【{severity}】{asset_name} — {title}"
    msg["From"]    = SMTP_FROM
    msg["To"]      = ", ".join(recipients)

    html_body = _build_html(severity, asset_name, title, description, occurred_at, alert_id)
    plain_body = f"[{severity}] {asset_name}\n{title}\n{description}\n發生時間: {occurred_at}"

    msg.attach(MIMEText(plain_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body,  "html",  "utf-8"))

    try:
        kwargs: dict = dict(
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASSWORD,
        )
        if SMTP_TLS == "ssl":
            kwargs["use_tls"] = True
        elif SMTP_TLS == "starttls":
            kwargs["start_tls"] = True

        await aiosmtplib.send(msg, recipients=recipients, **kwargs)
        logger.info(f"[Email] 告警郵件已送出: {title} → {recipients}")
    except Exception as e:
        logger.warning(f"[Email] 郵件發送失敗: {e}")
