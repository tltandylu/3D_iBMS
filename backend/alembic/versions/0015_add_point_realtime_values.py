"""Add point_realtime_values table

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-24
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "point_realtime_values" not in _existing_tables():
        op.create_table(
            "point_realtime_values",
            sa.Column("point_id",   sa.String(100), primary_key=True),
            sa.Column("value",      sa.Float(),     nullable=False),
            sa.Column("updated_at", sa.String(50),  nullable=False, server_default=""),
        )
        op.create_index("ix_prv_updated_at", "point_realtime_values", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_prv_updated_at", table_name="point_realtime_values")
    op.drop_table("point_realtime_values")
