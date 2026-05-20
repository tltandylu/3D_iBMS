"""
簡易記憶體稽核日誌（重啟後清空）
"""
from dataclasses import dataclass, field
from typing import List
import uuid
from datetime import datetime


@dataclass
class AuditEntry:
    id: str
    timestamp: str
    operation: str       # 'device_control' | 'alert_acknowledge' | 'workorder_update'
    actor: str = 'operator'
    device_id: str = ''
    device_name: str = ''
    command: str = ''
    result: str = ''     # 'success' | 'failed'
    message: str = ''


class AuditStore:
    def __init__(self, max_entries: int = 500):
        self._entries: List[AuditEntry] = []
        self._max = max_entries

    def add(self, operation: str, *, device_id: str = '', device_name: str = '',
            command: str = '', result: str = 'success', message: str = '', actor: str = 'operator') -> AuditEntry:
        entry = AuditEntry(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            operation=operation,
            actor=actor,
            device_id=device_id,
            device_name=device_name,
            command=command,
            result=result,
            message=message,
        )
        self._entries.insert(0, entry)
        if len(self._entries) > self._max:
            self._entries = self._entries[:self._max]
        return entry

    def recent(self, limit: int = 100, operation: str | None = None) -> List[AuditEntry]:
        entries = self._entries
        if operation:
            entries = [e for e in entries if e.operation == operation]
        return entries[:limit]
