"""task depends on

เพิ่ม depends_on ให้งาน — เก็บ id ของงานที่ต้องเสร็จก่อนใบนี้จะเริ่มได้
AI เป็นคนเสนอตอนแตกงาน ใช้แสดงว่าใบไหนเริ่มได้เลยและใบไหนต้องรอ
เป็นข้อมูลไว้แสดงผลเท่านั้น ระบบไม่ได้ล็อกไม่ให้รับงานที่ยังติดคิว

Revision ID: f4b7c2e08a19
Revises: e91a6c4d0f27
Create Date: 2026-09-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f4b7c2e08a19'
down_revision: Union[str, Sequence[str], None] = 'e91a6c4d0f27'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # งานเก่าปล่อยเป็น NULL = ไม่ต้องรอใคร เหมือนกับ tags ที่ก็ปล่อย NULL ได้
    op.add_column('tasks', sa.Column('depends_on', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'depends_on')
