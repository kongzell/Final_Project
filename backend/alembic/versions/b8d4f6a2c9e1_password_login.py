"""password login

เพิ่ม username + password_hash ให้ members สำหรับล็อกอินแบบธรรมดา
บัญชีที่มาจาก GitHub ปล่อยเป็น NULL ทั้งคู่ — สองทางอยู่ร่วมกันได้ในตารางเดียว

Revision ID: b8d4f6a2c9e1
Revises: a3c5e7f9b1d2
Create Date: 2026-09-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8d4f6a2c9e1'
down_revision: Union[str, Sequence[str], None] = 'a3c5e7f9b1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('members', sa.Column('username', sa.String(length=40), nullable=True))
    op.add_column('members', sa.Column('password_hash', sa.Text(), nullable=True))
    # unique แบบยอมให้ NULL ซ้ำได้ — บัญชี GitHub ทุกคนไม่มี username
    op.create_unique_constraint('uq_members_username', 'members', ['username'])


def downgrade() -> None:
    op.drop_constraint('uq_members_username', 'members', type_='unique')
    op.drop_column('members', 'password_hash')
    op.drop_column('members', 'username')
