"""定時排程報表服務 — 生成 HTML 摘要並透過 SMTP 寄送"""
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

_SEV_COLOR = {"CRITICAL": "#ef4444", "ALARM": "#f97316", "WARNING": "#f59e0b", "INFO": "#06b6d4"}
_STATUS_COLOR = {"pending": "#ef4444", "in_progress": "#f59e0b", "completed": "#10b981"}
_WEEKDAY_LABELS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"]


def build_report_html(store, open_alerts: list, work_orders: list, period: str) -> str:
    kpi = store.kpi
    devs = store.devices

    # 告警統計
    crit  = sum(1 for a in open_alerts if a.severity == "CRITICAL")
    alarm = sum(1 for a in open_alerts if a.severity == "ALARM")
    warn  = sum(1 for a in open_alerts if a.severity == "WARNING")

    # 工單統計
    pending     = sum(1 for w in work_orders if w.status == "pending")
    in_progress = sum(1 for w in work_orders if w.status == "in_progress")
    completed   = sum(1 for w in work_orders if w.status == "completed")

    # 前 5 筆 CRITICAL 告警
    top_alerts = [a for a in open_alerts if a.severity == "CRITICAL"][:5]

    # RUL 緊急設備（< 30 天）
    rul_urgent = sorted(
        [d for d in devs if d.rul_days is not None and d.rul_days < 30],
        key=lambda d: d.rul_days,
    )[:5]

    def alert_rows() -> str:
        if not top_alerts:
            return '<tr><td colspan="4" style="padding:10px;text-align:center;color:#64748b">無 CRITICAL 告警</td></tr>'
        rows = []
        for a in top_alerts:
            c = _SEV_COLOR.get(a.severity, "#94a3b8")
            rows.append(
                f'<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">'
                f'<td style="padding:6px 10px"><span style="background:{c}22;color:{c};padding:2px 7px;border-radius:3px;font-size:10px">{a.severity}</span></td>'
                f'<td style="padding:6px 10px;color:#f1f5f9;font-size:12px">{a.asset_name}</td>'
                f'<td style="padding:6px 10px;color:#cbd5e1;font-size:11px">{a.title}</td>'
                f'<td style="padding:6px 10px;color:#64748b;font-size:10px">{a.occurred_at[:16]}</td>'
                f'</tr>'
            )
        return "".join(rows)

    def rul_rows() -> str:
        if not rul_urgent:
            return '<tr><td colspan="3" style="padding:10px;text-align:center;color:#64748b">無緊急 RUL 設備</td></tr>'
        rows = []
        for d in rul_urgent:
            c = "#ef4444" if d.rul_days < 15 else "#f59e0b"
            rows.append(
                f'<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">'
                f'<td style="padding:6px 10px;color:#f1f5f9;font-size:12px">{d.name}</td>'
                f'<td style="padding:6px 10px"><span style="color:{c};font-weight:700">{d.rul_days} 天</span></td>'
                f'<td style="padding:6px 10px;color:#64748b;font-size:10px">{d.criticality or "—"}</td>'
                f'</tr>'
            )
        return "".join(rows)

    def kpi_card(label: str, value: str, unit: str, color: str = "#06b6d4") -> str:
        return (
            f'<div style="background:{color}0e;border:1px solid {color}22;border-radius:8px;padding:12px 16px;text-align:center;min-width:100px">'
            f'<div style="color:{color};font-size:22px;font-weight:700">{value}</div>'
            f'<div style="color:#94a3b8;font-size:10px;margin-top:2px">{label}</div>'
            f'<div style="color:{color};font-size:9px">{unit}</div>'
            f'</div>'
        )

    return f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<style>
  body {{font-family:'Segoe UI',Arial,sans-serif;background:#0f172a;margin:0;padding:24px;color:#e2e8f0;}}
  .card {{max-width:680px;margin:0 auto;background:#1e293b;border-radius:14px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;}}
  .header {{background:rgba(6,182,212,0.08);border-bottom:3px solid #06b6d4;padding:18px 24px;}}
  .section {{padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.05);}}
  .section-title {{color:#94a3b8;font-size:10px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;}}
  table {{width:100%;border-collapse:collapse;}}
  th {{color:#64748b;font-size:9px;letter-spacing:.06em;text-align:left;padding:5px 10px;}}
  .footer {{padding:12px 24px;color:#475569;font-size:10px;text-align:right;}}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:22px">📊</span>
      <div>
        <div style="font-size:16px;font-weight:700">智慧設施運營日報</div>
        <div style="color:#94a3b8;font-size:11px;margin-top:2px">{period}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">設備 KPI</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      {kpi_card("正常設備", str(kpi.online_devices),   "台",  "#10b981")}
      {kpi_card("警示設備", str(kpi.warning_devices),  "台",  "#f59e0b")}
      {kpi_card("嚴重設備", str(kpi.critical_devices), "台",  "#ef4444")}
      {kpi_card("離線設備", str(kpi.offline_devices),  "台",  "#6b7280")}
      {kpi_card("今日用電", str(round(kpi.today_kwh,1)), "kWh", "#06b6d4")}
      {kpi_card("需量使用率", str(round(kpi.demand_ratio_pct,1)), "%", "#8b5cf6")}
      {kpi_card("設備可用率", str(round(kpi.availability_pct,1)), "%", "#10b981")}
    </div>
  </div>

  <div class="section">
    <div class="section-title">告警統計</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      {kpi_card("CRITICAL", str(crit),  "件", "#ef4444")}
      {kpi_card("ALARM",    str(alarm), "件", "#f97316")}
      {kpi_card("WARNING",  str(warn),  "件", "#f59e0b")}
      {kpi_card("未處理合計", str(kpi.open_alerts), "件", "#94a3b8")}
    </div>
  </div>

  {'<div class="section"><div class="section-title">CRITICAL 告警清單</div><table><thead><tr>' + "".join(f'<th>{h}</th>' for h in ["嚴重度","設備","標題","時間"]) + '</tr></thead><tbody>' + alert_rows() + '</tbody></table></div>' if top_alerts or True else ''}

  <div class="section">
    <div class="section-title">工單狀況</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      {kpi_card("待處理", str(pending),     "件", "#ef4444")}
      {kpi_card("處理中", str(in_progress), "件", "#f59e0b")}
      {kpi_card("今日完成", str(kpi.today_completed_work_orders), "件", "#10b981")}
      {kpi_card("MTTR", str(round(kpi.mttr_hours,1)), "h", "#06b6d4")}
    </div>
  </div>

  {'<div class="section"><div class="section-title">⚠ RUL 緊急設備（&lt;30天）</div><table><thead><tr>' + "".join(f'<th>{h}</th>' for h in ["設備名稱","剩餘壽命","重要性"]) + '</tr></thead><tbody>' + rul_rows() + '</tbody></table></div>' if rul_urgent or True else ''}

  <div class="footer">AI-DT Enterprise Platform · 智慧設施監控管理平台 · {datetime.now().strftime("%Y-%m-%d %H:%M")}</div>
</div>
</body>
</html>"""


async def send_report(store, session_factory) -> bool:
    """讀取排程設定並在需要時發送報表郵件。回傳是否實際發送。"""
    from app.db.repository import DBRepository
    from app import email_service

    if not email_service.is_configured():
        return False

    async with session_factory() as db_session:
        repo     = DBRepository(db_session)
        schedule = await repo.get_report_schedule()
        alerts   = await repo.get_alerts(limit=200)
        wos      = await repo.get_workorders()

    if not schedule or not schedule["enabled"]:
        return False

    recipients_raw = schedule["recipients"].strip()
    recipients     = [r.strip() for r in recipients_raw.split(",") if r.strip()]
    if not recipients:
        recipients = email_service.get_recipients()
    if not recipients:
        return False

    now = datetime.now()
    period = now.strftime("%Y年%m月%d日 %H:%M")

    html  = build_report_html(store, alerts, wos, period)
    plain = f"[日報] {period} — 設備 {store.kpi.total_devices} 台，告警 {store.kpi.open_alerts} 件，待處理工單 {store.kpi.pending_work_orders} 件"

    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    import aiosmtplib

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"【智慧設施日報】{now.strftime('%Y-%m-%d')} 運營摘要"
    msg["From"]    = email_service.SMTP_FROM
    msg["To"]      = ", ".join(recipients)
    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html,  "html",  "utf-8"))

    status = "fail"
    try:
        kwargs: dict = dict(
            hostname=email_service.SMTP_HOST,
            port=email_service.SMTP_PORT,
            username=email_service.SMTP_USER,
            password=email_service.SMTP_PASSWORD,
        )
        if email_service.SMTP_TLS == "ssl":
            kwargs["use_tls"] = True
        elif email_service.SMTP_TLS == "starttls":
            kwargs["start_tls"] = True
        await aiosmtplib.send(msg, recipients=recipients, **kwargs)
        status = "ok"
        logger.info(f"[Report] 日報已送出 → {recipients}")
    except Exception as e:
        logger.warning(f"[Report] 日報發送失敗: {e}")

    async with session_factory() as db_session:
        repo = DBRepository(db_session)
        await repo.update_report_delivery(now.isoformat(), status)

    return status == "ok"
