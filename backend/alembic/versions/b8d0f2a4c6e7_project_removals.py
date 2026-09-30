"""project removals

จำว่าใครถูกเอาออกจากโปรเจค — กันไม่ให้ล็อกอินด้วย GitHub แล้วถูกใส่กลับเข้าโปรเจคเอง

Revision ID: b8d0f2a4c6e7
Revises: a7c9e1b3d5f6
Create Date: 2026-09-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8d0f2a4c6e7'
down_revision: Union[str, Sequence[str], None] = 'a7c9e1b3d5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'project_removals',
        sa.Column('project_id', sa.String(length=36), nullable=False),
        sa.Column('member_id', sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('project_id', 'member_id'),
    )


def downgrade() -> None:
    op.drop_table('project_removals')
