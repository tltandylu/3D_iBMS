"""Add inbox_notifications table

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "inbox_notifications" not in _existing_tables():
        op.create_table(
            "inbox_notifications",
            sa.Column("id",         sa.String(50),  primary_key=True),
            sa.Column("type",       sa.String(30),  nullable=False),
            sa.Column("title",      sa.String(200), nullable=False),
            sa.Column("message",    sa.Text(),       nullable=False, server_default=""),
            sa.Column("severity",   sa.String(20),  nullable=True),
            sa.Column("related_id", sa.String(50),  nullable=True),
            sa.Column("is_read",    sa.Integer(),   nullable=False, server_default="0"),
            sa.Column("created_at", sa.String(50),  nullable=False, server_default=""),
        )
        op.create_index("ix_inbox_notifications_created_at", "inbox_notifications", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_inbox_notifications_created_at", table_name="inbox_notifications")
    op.drop_table("inbox_notifications")
