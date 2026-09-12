"""Add report_schedules table

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "report_schedules" not in _existing_tables():
        op.create_table(
            "report_schedules",
            sa.Column("id",           sa.String(20),  primary_key=True),
            sa.Column("enabled",      sa.Integer(),   nullable=False, server_default="0"),
            sa.Column("frequency",    sa.String(10),  nullable=False, server_default="daily"),
            sa.Column("weekday",      sa.Integer(),   nullable=False, server_default="1"),
            sa.Column("hour",         sa.Integer(),   nullable=False, server_default="8"),
            sa.Column("recipients",   sa.Text(),      nullable=False, server_default=""),
            sa.Column("last_sent_at", sa.String(50),  nullable=True),
            sa.Column("last_status",  sa.String(20),  nullable=True),
        )


def downgrade() -> None:
    op.drop_table("report_schedules")
