"""Add spare_parts table

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "spare_parts" not in _existing_tables():
        op.create_table(
            "spare_parts",
            sa.Column("id",              sa.String(50),  primary_key=True),
            sa.Column("part_number",     sa.String(50),  nullable=False),
            sa.Column("name",            sa.String(200), nullable=False),
            sa.Column("description",     sa.Text(),       nullable=False, server_default=""),
            sa.Column("category",        sa.String(20),  nullable=False, server_default="General"),
            sa.Column("unit",            sa.String(20),  nullable=False, server_default="個"),
            sa.Column("quantity",        sa.Integer(),   nullable=False, server_default="0"),
            sa.Column("min_stock_level", sa.Integer(),   nullable=False, server_default="1"),
            sa.Column("unit_cost",       sa.Float(),     nullable=False, server_default="0"),
            sa.Column("location",        sa.String(100), nullable=False, server_default=""),
            sa.Column("supplier_name",   sa.String(200), nullable=False, server_default=""),
            sa.Column("updated_at",      sa.String(50),  nullable=False, server_default=""),
        )
        op.create_index("ix_spare_parts_part_number", "spare_parts", ["part_number"], unique=True)
        op.create_index("ix_spare_parts_category",    "spare_parts", ["category"])


def downgrade() -> None:
    op.drop_index("ix_spare_parts_category",    table_name="spare_parts")
    op.drop_index("ix_spare_parts_part_number", table_name="spare_parts")
    op.drop_table("spare_parts")
