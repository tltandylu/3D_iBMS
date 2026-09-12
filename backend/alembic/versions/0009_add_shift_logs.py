"""Add shift_logs table

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "shift_logs" not in _existing_tables():
        op.create_table(
            "shift_logs",
            sa.Column("id",              sa.String(50),  primary_key=True),
            sa.Column("shift_type",      sa.String(20),  nullable=False),
            sa.Column("operator_name",   sa.String(100), nullable=False),
            sa.Column("start_time",      sa.String(50),  nullable=False),
            sa.Column("end_time",        sa.String(50),  nullable=True),
            sa.Column("summary",         sa.Text(),       nullable=False, server_default=""),
            sa.Column("incidents",       sa.Text(),       nullable=False, server_default="[]"),
            sa.Column("handover_notes",  sa.Text(),       nullable=False, server_default=""),
            sa.Column("device_snapshot", sa.Text(),       nullable=True),
            sa.Column("is_closed",       sa.Integer(),   nullable=False, server_default="0"),
            sa.Column("created_at",      sa.String(50),  nullable=False, server_default=""),
        )
        op.create_index("ix_shift_logs_start_time", "shift_logs", ["start_time"])


def downgrade() -> None:
    op.drop_index("ix_shift_logs_start_time", table_name="shift_logs")
    op.drop_table("shift_logs")
