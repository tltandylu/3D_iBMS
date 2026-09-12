"""Initial schema — all tables

Revision ID: 0001
Revises:
Create Date: 2026-05-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    """Return set of table names already present in the database."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    existing = _existing_tables()

    if "alerts" not in existing:
        op.create_table(
            "alerts",
            sa.Column("id",                   sa.String(50),  primary_key=True),
            sa.Column("asset_id",             sa.String(50),  nullable=False),
            sa.Column("asset_name",           sa.String(200), nullable=False),
            sa.Column("title",                sa.String(500), nullable=False),
            sa.Column("description",          sa.Text(),      nullable=False, server_default=""),
            sa.Column("severity",             sa.String(20),  nullable=False),
            sa.Column("status",               sa.String(20),  nullable=False, server_default="open"),
            sa.Column("occurred_at",          sa.String(50),  nullable=False),
            sa.Column("ai_root_cause",        sa.Text(),      nullable=True),
            sa.Column("ai_action_suggestion", sa.Text(),      nullable=True),
            sa.Column("floor",                sa.Integer(),   nullable=False, server_default="1"),
            sa.Column("building_id",          sa.String(50),  nullable=False, server_default=""),
        )

    if "work_orders" not in existing:
        op.create_table(
            "work_orders",
            sa.Column("id",              sa.String(50),  primary_key=True),
            sa.Column("wo_number",       sa.String(50),  nullable=False),
            sa.Column("wo_type",         sa.String(10),  nullable=False),
            sa.Column("title",           sa.String(500), nullable=False),
            sa.Column("priority",        sa.String(20),  nullable=False),
            sa.Column("status",          sa.String(20),  nullable=False),
            sa.Column("asset_id",        sa.String(50),  nullable=False),
            sa.Column("asset_name",      sa.String(200), nullable=False),
            sa.Column("assigned_to",     sa.String(100), nullable=True),
            sa.Column("estimated_hours", sa.Float(),     nullable=False),
            sa.Column("actual_hours",    sa.Float(),     nullable=True),
            sa.Column("created_at",      sa.String(50),  nullable=False),
            sa.Column("ai_root_cause",   sa.Text(),      nullable=True),
        )

    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id",              sa.String(50),  primary_key=True),
            sa.Column("username",        sa.String(200), nullable=False, unique=True),
            sa.Column("name",            sa.String(100), nullable=False),
            sa.Column("hashed_password", sa.String(200), nullable=False),
            sa.Column("role",            sa.String(20),  nullable=False, server_default="viewer"),
            sa.Column("avatar_color",    sa.String(20),  nullable=False, server_default="#06b6d4"),
            sa.Column("is_active",       sa.Integer(),   nullable=False, server_default="1"),
            sa.Column("created_at",      sa.String(50),  nullable=False),
        )
        op.create_index("ix_users_username", "users", ["username"], unique=True)

    if "push_subscriptions" not in existing:
        op.create_table(
            "push_subscriptions",
            sa.Column("endpoint",   sa.String(2000), primary_key=True),
            sa.Column("p256dh",     sa.String(200),  nullable=False),
            sa.Column("auth_key",   sa.String(100),  nullable=False),
            sa.Column("username",   sa.String(200),  nullable=False, server_default=""),
            sa.Column("created_at", sa.String(50),   nullable=False),
        )

    if "audit_logs" not in existing:
        op.create_table(
            "audit_logs",
            sa.Column("id",          sa.String(50),  primary_key=True),
            sa.Column("timestamp",   sa.String(50),  nullable=False),
            sa.Column("operation",   sa.String(50),  nullable=False),
            sa.Column("actor",       sa.String(100), nullable=False, server_default="operator"),
            sa.Column("device_id",   sa.String(50),  nullable=False, server_default=""),
            sa.Column("device_name", sa.String(200), nullable=False, server_default=""),
            sa.Column("command",     sa.String(100), nullable=False, server_default=""),
            sa.Column("result",      sa.String(20),  nullable=False, server_default="success"),
            sa.Column("message",     sa.Text(),      nullable=False, server_default=""),
        )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("push_subscriptions")
    op.drop_table("users")
    op.drop_table("work_orders")
    op.drop_table("alerts")
