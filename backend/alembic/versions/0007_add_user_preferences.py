"""Add user_preferences table

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return set(inspector.get_table_names())


def upgrade() -> None:
    if "user_preferences" not in _existing_tables():
        op.create_table(
            "user_preferences",
            sa.Column("user_id",    sa.String(50),  primary_key=True),
            sa.Column("data",       sa.Text(),       nullable=False, server_default="{}"),
            sa.Column("updated_at", sa.String(50),   nullable=False, server_default=""),
        )


def downgrade() -> None:
    op.drop_table("user_preferences")
