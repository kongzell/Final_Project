"""task attachments

ผู้รับงานแนบไฟล์ผลงานกับการ์ดได้ ไฟล์อยู่ที่การ์ดระหว่างรอตรวจ แล้วถูกเก็บลงที่เก็บเอกสาร
ประจำโปรเจคเมื่องานผ่านการตรวจ — จึงต้องมีทั้งตารางไฟล์แนบ และคอลัมน์ที่เก็บประจำโปรเจค

Revision ID: e3a5c7e9f1b2
Revises: d2f4b6a8c0e1
Create Date: 2026-11-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e3a5c7e9f1b2'
down_revision: Union[str, Sequence[str], None] = 'd2f4b6a8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'projects',
        sa.Column('document_case_id', sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        'projects_document_case_id_fkey', 'projects', 'cases',
        ['document_case_id'], ['id'], ondelete='SET NULL',
    )

    op.create_table(
        'task_attachments',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'task_id', sa.String(length=36),
            sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('filename', sa.Text(), nullable=False),
        sa.Column('content_type', sa.String(length=120), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column(
            'uploaded_by', sa.String(length=36),
            sa.ForeignKey('members.id', ondelete='SET NULL'), nullable=True,
        ),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'file_id', sa.String(length=36),
            sa.ForeignKey('case_files.id', ondelete='SET NULL'), nullable=True,
        ),
    )
    op.create_index('ix_task_attachments_task_id', 'task_attachments', ['task_id'])


def downgrade() -> None:
    op.drop_index('ix_task_attachments_task_id', table_name='task_attachments')
    op.drop_table('task_attachments')
    op.drop_constraint('projects_document_case_id_fkey', 'projects', type_='foreignkey')
    op.drop_column('projects', 'document_case_id')
