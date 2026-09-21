"""document deadline notified

ธงกันแจ้งซ้ำสำหรับอีเมล "เอกสารใกล้กำหนดส่ง" และ "เอกสารเลยกำหนดส่ง" — รายใบ

Revision ID: a7c9e1b3d5f6
Revises: f6b8d0e2a4c5
Create Date: 2026-09-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a7c9e1b3d5f6'
down_revision: Union[str, Sequence[str], None] = 'f6b8d0e2a4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('case_files', sa.Column('due_soon_notified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('case_files', sa.Column('overdue_notified_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('case_files', 'overdue_notified_at')
    op.drop_column('case_files', 'due_soon_notified_at')
