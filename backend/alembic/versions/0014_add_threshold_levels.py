"""Add warning/alarm threshold columns to monitoring_points

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-24
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    cols = _existing_columns("monitoring_points")
    for col in ("warning_low", "alarm_low", "warning_high", "alarm_high"):
        if col not in cols:
            op.add_column("monitoring_points", sa.Column(col, sa.Float(), nullable=True))


def downgrade() -> None:
    for col in ("alarm_high", "warning_high", "alarm_low", "warning_low"):
        op.drop_column("monitoring_points", col)
