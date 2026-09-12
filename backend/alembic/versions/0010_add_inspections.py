"""Add inspection_routes and inspection_records tables

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    existing = _existing_tables()
    if "inspection_routes" not in existing:
        op.create_table(
            "inspection_routes",
            sa.Column("id",          sa.String(50),  primary_key=True),
            sa.Column("name",        sa.String(200), nullable=False),
            sa.Column("description", sa.Text(),       nullable=False, server_default=""),
            sa.Column("device_ids",  sa.Text(),       nullable=False, server_default="[]"),
            sa.Column("frequency",   sa.String(20),  nullable=False, server_default="daily"),
            sa.Column("created_by",  sa.String(100), nullable=False, server_default=""),
            sa.Column("created_at",  sa.String(50),  nullable=False),
        )

    if "inspection_records" not in existing:
        op.create_table(
            "inspection_records",
            sa.Column("id",             sa.String(50),  primary_key=True),
            sa.Column("route_id",       sa.String(50),  nullable=False),
            sa.Column("route_name",     sa.String(200), nullable=False),
            sa.Column("inspector_name", sa.String(100), nullable=False),
            sa.Column("started_at",     sa.String(50),  nullable=False),
            sa.Column("completed_at",   sa.String(50),  nullable=True),
            sa.Column("status",         sa.String(20),  nullable=False, server_default="in_progress"),
            sa.Column("findings",       sa.Text(),       nullable=False, server_default="[]"),
            sa.Column("overall_result", sa.String(10),  nullable=True),
        )
        op.create_index("ix_inspection_records_route_id",   "inspection_records", ["route_id"])
        op.create_index("ix_inspection_records_started_at", "inspection_records", ["started_at"])


def downgrade() -> None:
    op.drop_index("ix_inspection_records_started_at", table_name="inspection_records")
    op.drop_index("ix_inspection_records_route_id",   table_name="inspection_records")
    op.drop_table("inspection_records")
    op.drop_table("inspection_routes")
