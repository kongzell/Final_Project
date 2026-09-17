"""task started at

เพิ่ม started_at ให้งาน — เวลาที่งานถูกดึงออกจาก "รอเริ่ม" ครั้งแรก
ใช้คำนวณเวลาที่ใช้จริง (completed_at - started_at) แยกจาก estimate_hours
ที่เป็นแค่ตัวเลขที่ AI เดาไว้ล่วงหน้า ไม่ใช่เวลาที่ใช้จริง

Revision ID: d2f8b4a91c73
Revises: b7d3e9f21a5c
Create Date: 2026-09-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd2f8b4a91c73'
down_revision: Union[str, Sequence[str], None] = 'b7d3e9f21a5c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('started_at', sa.DateTime(timezone=True), nullable=True))

    # งานที่ทำไปแล้วก่อนอัปเดตนี้ ไม่มีทางรู้ว่าเริ่มจริงเมื่อไหร่ — ประมาณจาก created_at
    # ไปก่อน ดีกว่าปล่อยว่างแล้วงานเก่าไม่มีเวลาที่ใช้จริงให้ดูเลยสักงาน
    op.execute(
        "UPDATE tasks SET started_at = created_at WHERE status IN ('in-progress', 'review', 'complete')"
    )


def downgrade() -> None:
    op.drop_column('tasks', 'started_at')
