"""Add webhook_configs table

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "webhook_configs" not in _existing_tables():
        op.create_table(
            "webhook_configs",
            sa.Column("id",                sa.String(20),   primary_key=True),
            sa.Column("enabled",           sa.Integer(),    nullable=False, server_default="0"),
            sa.Column("url",               sa.String(2000), nullable=False, server_default=""),
            sa.Column("min_severity",      sa.String(20),   nullable=False, server_default="CRITICAL"),
            sa.Column("cooldown_minutes",  sa.Integer(),    nullable=False, server_default="5"),
            sa.Column("last_triggered_at", sa.String(50),   nullable=True),
            sa.Column("last_status",       sa.String(20),   nullable=True),
        )


def downgrade() -> None:
    op.drop_table("webhook_configs")
