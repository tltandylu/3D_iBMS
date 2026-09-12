"""Add device_metrics table

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "device_metrics" not in _existing_tables():
        op.create_table(
            "device_metrics",
            sa.Column("id",          sa.Integer(),   primary_key=True, autoincrement=True),
            sa.Column("device_id",   sa.String(50),  nullable=False),
            sa.Column("recorded_at", sa.String(50),  nullable=False),
            sa.Column("power_kw",    sa.Float(),     nullable=True),
            sa.Column("temperature", sa.Float(),     nullable=True),
            sa.Column("ai_score",    sa.Float(),     nullable=True),
            sa.Column("rul_days",    sa.Float(),     nullable=True),
        )
        op.create_index("ix_device_metrics_device_id",   "device_metrics", ["device_id"])
        op.create_index("ix_device_metrics_recorded_at", "device_metrics", ["recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_device_metrics_recorded_at", table_name="device_metrics")
    op.drop_index("ix_device_metrics_device_id",   table_name="device_metrics")
    op.drop_table("device_metrics")
