"""Add monitoring_points and model_point_bindings tables

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-23
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    existing = _existing_tables()
    if "monitoring_points" not in existing:
        op.create_table(
            "monitoring_points",
            sa.Column("id",             sa.String(50),  primary_key=True),
            sa.Column("point_id",       sa.String(100), nullable=False),
            sa.Column("point_code",     sa.String(100), nullable=False),
            sa.Column("point_name",     sa.String(255), nullable=False),
            sa.Column("point_type",     sa.String(10),  nullable=False),
            sa.Column("system_type",    sa.String(100), nullable=False, server_default=""),
            sa.Column("equipment_name", sa.String(255), nullable=False, server_default=""),
            sa.Column("unit",           sa.String(50),  nullable=False, server_default=""),
            sa.Column("normal_value",   sa.String(50),  nullable=True),
            sa.Column("alarm_value",    sa.String(50),  nullable=True),
            sa.Column("min_value",      sa.Float(),     nullable=True),
            sa.Column("max_value",      sa.Float(),     nullable=True),
            sa.Column("description",    sa.Text(),      nullable=False, server_default=""),
            sa.Column("created_at",     sa.String(50),  nullable=False, server_default=""),
        )
        op.create_index("ix_monitoring_points_point_id",   "monitoring_points", ["point_id"],   unique=True)
        op.create_index("ix_monitoring_points_point_type", "monitoring_points", ["point_type"])
    if "model_point_bindings" not in existing:
        op.create_table(
            "model_point_bindings",
            sa.Column("id",              sa.String(50),  primary_key=True),
            sa.Column("model_uuid",      sa.String(100), nullable=False),
            sa.Column("model_name",      sa.String(255), nullable=False, server_default=""),
            sa.Column("point_id",        sa.String(100), nullable=False),
            sa.Column("point_type",      sa.String(10),  nullable=False),
            sa.Column("display_mode",    sa.String(50),  nullable=False, server_default="color"),
            sa.Column("normal_color",    sa.String(20),  nullable=False, server_default="#22C55E"),
            sa.Column("alarm_color",     sa.String(20),  nullable=False, server_default="#EF4444"),
            sa.Column("offline_color",   sa.String(20),  nullable=False, server_default="#9CA3AF"),
            sa.Column("control_enabled", sa.Integer(),   nullable=False, server_default="0"),
            sa.Column("value_position",  sa.String(50),  nullable=False, server_default="auto"),
            sa.Column("is_active",       sa.Integer(),   nullable=False, server_default="1"),
            sa.Column("created_at",      sa.String(50),  nullable=False, server_default=""),
        )
        op.create_index("ix_mpb_model_uuid", "model_point_bindings", ["model_uuid"])
        op.create_index("ix_mpb_point_id",   "model_point_bindings", ["point_id"])


def downgrade() -> None:
    op.drop_index("ix_mpb_point_id",   table_name="model_point_bindings")
    op.drop_index("ix_mpb_model_uuid", table_name="model_point_bindings")
    op.drop_table("model_point_bindings")
    op.drop_index("ix_monitoring_points_point_type", table_name="monitoring_points")
    op.drop_index("ix_monitoring_points_point_id",   table_name="monitoring_points")
    op.drop_table("monitoring_points")
