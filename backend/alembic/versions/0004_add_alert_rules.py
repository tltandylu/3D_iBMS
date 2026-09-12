"""Add alert_rules table

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "alert_rules" not in _existing_tables():
        op.create_table(
            "alert_rules",
            sa.Column("id",         sa.String(50),  primary_key=True),
            sa.Column("name",       sa.String(200), nullable=False),
            sa.Column("device_id",  sa.String(50),  nullable=False, server_default="*"),
            sa.Column("metric",     sa.String(30),  nullable=False),
            sa.Column("operator",   sa.String(5),   nullable=False),
            sa.Column("threshold",  sa.Float(),     nullable=False),
            sa.Column("severity",   sa.String(20),  nullable=False),
            sa.Column("enabled",    sa.Integer(),   nullable=False, server_default="1"),
            sa.Column("created_at", sa.String(50),  nullable=False),
            sa.Column("created_by", sa.String(100), nullable=False, server_default=""),
        )


def downgrade() -> None:
    op.drop_table("alert_rules")
