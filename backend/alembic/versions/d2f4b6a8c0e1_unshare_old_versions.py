"""unshare old versions

เดิมถอดเอกสารใบล่าสุดออกจากโปรเจคแล้วแก้แค่ใบนั้น ฉบับเก่ายังผูกอยู่ ทีมโปรเจคจึงยังเปิดได้
โค้ดแก้แล้ว ส่วนนี้เก็บกวาดแถวที่ค้างสถานะนั้นอยู่: ถอดฉบับเก่าที่ผูกโปรเจคไม่ตรงกับฉบับถัดไป

วนจนไม่เหลือเพราะสายเอกสารยาวได้หลายฉบับ ถอดอย่างเดียวไม่ผูกเพิ่ม คนที่เห็นเอกสารจึงมีแต่ลดลง

Revision ID: d2f4b6a8c0e1
Revises: c1e3a5b7d9f0
Create Date: 2026-11-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd2f4b6a8c0e1'
down_revision: Union[str, Sequence[str], None] = 'c1e3a5b7d9f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    while conn.execute(
        sa.text(
            """
            UPDATE case_files AS old
            SET project_id = NULL
            FROM case_files AS newer
            WHERE newer.replaces_id = old.id
              AND old.project_id IS NOT NULL
              AND old.project_id IS DISTINCT FROM newer.project_id
            """
        )
    ).rowcount:
        pass


def downgrade() -> None:
    # ไม่มีอะไรให้ย้อน — การผูกที่ถอดไปคือสถานะที่ผิดอยู่แล้ว และไม่ได้จดไว้ว่าเคยผูกโปรเจคไหน
    pass
