"""WebSocket 連線管理器"""
import json
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._active: list[WebSocket] = []

    @property
    def count(self) -> int:
        return len(self._active)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.append(ws)
        logger.info(f"[WS] 客戶端連線，目前 {self.count} 個連線")

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._active:
            self._active.remove(ws)
        logger.info(f"[WS] 客戶端斷線，目前 {self.count} 個連線")

    async def broadcast(self, message: dict) -> None:
        dead: list[WebSocket] = []
        data = json.dumps(message, ensure_ascii=False)
        for ws in list(self._active):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_to(self, ws: WebSocket, message: dict) -> None:
        try:
            await ws.send_text(json.dumps(message, ensure_ascii=False))
        except Exception:
            self.disconnect(ws)
