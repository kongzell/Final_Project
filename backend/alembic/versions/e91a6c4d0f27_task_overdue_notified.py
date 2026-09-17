"""task overdue notified

เพิ่ม overdue_notified_at ให้งาน — กันแจ้งเตือน "เลยกำหนดส่ง" ทางอีเมลซ้ำ
ตัวงานเก่าที่มีอยู่แล้วปล่อยเป็น NULL ทั้งหมด รอบเช็คแรกหลัง deploy จะไล่แจ้งงาน
ที่เลยกำหนดอยู่แล้วให้หมดในรอบเดียว ไม่ต้องมี logic พิเศษแยกงานเก่า/ใหม่

Revision ID: e91a6c4d0f27
Revises: d2f8b4a91c73
Create Date: 2026-09-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e91a6c4d0f27'
down_revision: Union[str, Sequence[str], None] = 'd2f8b4a91c73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('overdue_notified_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'overdue_notified_at')
