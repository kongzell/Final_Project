"""webhook event repo

เพิ่ม repo ให้ webhook_events เพื่อกรองฟีดตามโปรเจคที่คนดูเป็นสมาชิก
เดิม /api/github/events คืนทุก event ให้ทุกคนที่ล็อกอิน — พอเปิดสมัครบัญชีธรรมดาได้
ใครก็สมัครแล้วเห็นชื่องาน/ชื่อคนของทุกโปรเจคทันที

แถวเก่าไม่มี repo — เดาจากรหัสงาน (prefix ของโปรเจค) เท่าที่เดาได้ ที่เหลือปล่อย NULL
ซึ่งจะไม่แสดงให้ใครเห็น (ซ่อนดีกว่ารั่ว)

Revision ID: c9e5a1b7d3f2
Revises: b8d4f6a2c9e1
Create Date: 2026-09-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c9e5a1b7d3f2'
down_revision: Union[str, Sequence[str], None] = 'b8d4f6a2c9e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('webhook_events', sa.Column('repo', sa.String(length=200), nullable=True))
    op.create_index('ix_webhook_events_repo_received', 'webhook_events', ['repo', 'received_at'])
    # backfill: TASK-003 -> โปรเจคที่ task_prefix = TASK (ถ้าสอง repo ใช้ prefix เดียวกัน ได้อันใดอันหนึ่ง)
    op.execute(
        """
        UPDATE webhook_events e
        SET repo = p.github_repo
        FROM projects p
        WHERE e.repo IS NULL
          AND e.task_ref IS NOT NULL
          AND p.github_repo IS NOT NULL
          AND e.task_ref LIKE p.task_prefix || '-%'
        """
    )


def downgrade() -> None:
    op.drop_index('ix_webhook_events_repo_received', table_name='webhook_events')
    op.drop_column('webhook_events', 'repo')
