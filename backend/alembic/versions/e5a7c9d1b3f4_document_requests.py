"""document requests

ขอเอกสารข้ามที่เก็บ — ทีม A ขอเอกสารจากทีม B ผู้ดูแลของ B เลือกไฟล์ส่งให้
ไฟล์จะถูกคัดลอกเข้าที่เก็บของ A (แถวใหม่ใน case_files) และคำขอชี้ไปที่สำเนานั้น

Revision ID: e5a7c9d1b3f4
Revises: d0f2a4b6c8e3
Create Date: 2026-09-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5a7c9d1b3f4'
down_revision: Union[str, Sequence[str], None] = 'd0f2a4b6c8e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'document_requests',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('from_case_id', sa.String(length=36), nullable=False),
        sa.Column('to_case_id', sa.String(length=36), nullable=False),
        sa.Column('requested_by', sa.String(length=36), nullable=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('file_id', sa.String(length=36), nullable=True),
        sa.Column('reply', sa.Text(), nullable=True),
        sa.Column('resolved_by', sa.String(length=36), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['from_case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['to_case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requested_by'], ['members.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['resolved_by'], ['members.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['file_id'], ['case_files.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_document_requests_to', 'document_requests', ['to_case_id', 'status'])
    op.create_index('ix_document_requests_from', 'document_requests', ['from_case_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_document_requests_from', table_name='document_requests')
    op.drop_index('ix_document_requests_to', table_name='document_requests')
    op.drop_table('document_requests')
