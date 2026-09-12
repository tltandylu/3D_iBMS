"""Add indexes for alert filtering performance

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_exists(index_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in ("alerts", "work_orders", "audit_logs"):
        for idx in inspector.get_indexes(table):
            if idx["name"] == index_name:
                return True
    return False


def upgrade() -> None:
    if not _index_exists("ix_alerts_status"):
        op.create_index("ix_alerts_status",     "alerts",      ["status"])
    if not _index_exists("ix_alerts_severity"):
        op.create_index("ix_alerts_severity",   "alerts",      ["severity"])
    if not _index_exists("ix_wo_status"):
        op.create_index("ix_wo_status",         "work_orders", ["status"])
    if not _index_exists("ix_audit_timestamp"):
        op.create_index("ix_audit_timestamp",   "audit_logs",  ["timestamp"])


def downgrade() -> None:
    op.drop_index("ix_audit_timestamp",  table_name="audit_logs")
    op.drop_index("ix_wo_status",        table_name="work_orders")
    op.drop_index("ix_alerts_severity",  table_name="alerts")
    op.drop_index("ix_alerts_status",    table_name="alerts")
