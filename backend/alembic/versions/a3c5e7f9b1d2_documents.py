"""documents (cases, case_files, case_members) + tasks.source_file_id

หน้า Documents เฟส 1 — "เรื่อง" ที่รวมเอกสารของงานเดียวกัน มีสมาชิกของตัวเอง
ผูกโปรเจคได้ 1 ต่อ 1 และงานจำได้ว่าถูกแตกมาจากไฟล์ไหน

ตัวไฟล์เก็บใน Postgres (bytea) เพราะ Render ฟรีไม่มีดิสก์ถาวร

Revision ID: a3c5e7f9b1d2
Revises: f4b7c2e08a19
Create Date: 2026-09-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a3c5e7f9b1d2'
down_revision: Union[str, Sequence[str], None] = 'f4b7c2e08a19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cases',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('doc_number', sa.String(length=60), nullable=True),
        sa.Column('agency', sa.String(length=160), nullable=True),
        sa.Column('deadline', sa.Date(), nullable=True),
        sa.Column('owner_id', sa.String(length=36), nullable=True),
        sa.Column('project_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['members.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        # 1 เรื่อง : 1 โปรเจค — บังคับที่ฐานข้อมูล ไม่พึ่งแค่โค้ด
        sa.UniqueConstraint('project_id'),
    )

    op.create_table(
        'case_members',
        sa.Column('case_id', sa.String(length=36), nullable=False),
        sa.Column('member_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=10), server_default='member', nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('case_id', 'member_id'),
    )

    op.create_table(
        'case_files',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('case_id', sa.String(length=36), nullable=False),
        sa.Column('filename', sa.Text(), nullable=False),
        sa.Column('content_type', sa.String(length=120), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(length=30), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('replaces_id', sa.String(length=36), nullable=True),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('uploaded_by', sa.String(length=36), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['replaces_id'], ['case_files.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['uploaded_by'], ['members.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )

    # งานจำว่าแตกมาจากไฟล์ไหน — SET NULL เพราะลบเอกสารแล้วงานต้องไม่หายตาม
    op.add_column('tasks', sa.Column('source_file_id', sa.String(length=36), nullable=True))
    op.create_foreign_key(
        'fk_tasks_source_file', 'tasks', 'case_files', ['source_file_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_tasks_source_file', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'source_file_id')
    op.drop_table('case_files')
    op.drop_table('case_members')
    op.drop_table('cases')
