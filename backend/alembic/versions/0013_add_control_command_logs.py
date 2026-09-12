"""Add control_command_logs table

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-24
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "control_command_logs" not in _existing_tables():
        op.create_table(
            "control_command_logs",
            sa.Column("id",         sa.String(50),  primary_key=True),
            sa.Column("point_id",   sa.String(100), nullable=False),
            sa.Column("model_uuid", sa.String(100), nullable=False),
            sa.Column("value",      sa.Float(),     nullable=False),
            sa.Column("issued_by",  sa.String(100), nullable=False, server_default=""),
            sa.Column("result",     sa.String(20),  nullable=False, server_default="sent"),
            sa.Column("created_at", sa.String(50),  nullable=False, server_default=""),
        )
        op.create_index("ix_ccl_point_id",   "control_command_logs", ["point_id"])
        op.create_index("ix_ccl_model_uuid", "control_command_logs", ["model_uuid"])
        op.create_index("ix_ccl_created_at", "control_command_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ccl_created_at", table_name="control_command_logs")
    op.drop_index("ix_ccl_model_uuid", table_name="control_command_logs")
    op.drop_index("ix_ccl_point_id",   table_name="control_command_logs")
    op.drop_table("control_command_logs")
