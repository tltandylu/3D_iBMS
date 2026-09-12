"""排程器 — asyncio 背景任務，每分鐘醒來一次，判斷是否應發送日報。"""
import asyncio
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

_WEEKDAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]


async def _should_send(schedule: dict, now: datetime) -> bool:
    """判斷當前時刻是否應觸發發送（精確到小時，同一小時只發一次）。"""
    if not schedule["enabled"]:
        return False

    if now.hour != schedule["hour"]:
        return False

    if schedule["frequency"] == "weekly" and now.weekday() != schedule["weekday"]:
        return False

    # 防重複：last_sent_at 在同一小時內已發過
    last = schedule.get("last_sent_at")
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if (last_dt.date() == now.date() and last_dt.hour == now.hour
                    and schedule["frequency"] == "daily"):
                return False
            if (last_dt.isocalendar()[:2] == now.isocalendar()[:2]
                    and schedule["frequency"] == "weekly"):
                return False
        except ValueError:
            pass

    return True


async def run_report_scheduler(app_state) -> None:
    """每 60 秒醒來，判斷是否需要發送定時報表。"""
    logger.info("[Scheduler] 定時報表排程器已啟動")
    while True:
        await asyncio.sleep(60)
        try:
            from app.db.repository import DBRepository
            async with app_state.session_factory() as db_session:
                repo     = DBRepository(db_session)
                schedule = await repo.get_report_schedule()

            if schedule and await _should_send(schedule, datetime.now()):
                from app.report_service import send_report
                await send_report(app_state.store, app_state.session_factory)
        except Exception as e:
            logger.warning(f"[Scheduler] 排程器發生錯誤: {e}")
