"""document per-file metadata

Document เปลี่ยนความหมายเป็น "ที่เก็บเอกสารกลางของทีม" — เอกสารทุกเรื่องส่งเข้าที่เดียว
เรื่อง/เลขที่/หน่วยงาน/กำหนดส่ง/สถานะ/โปรเจคที่ผูก จึงเป็นของเอกสารแต่ละใบ ไม่ใช่ของ Document

ย้ายค่าที่เคยตั้งไว้ระดับ Document ลงไปใส่ทุกไฟล์ในนั้นก่อน แล้วค่อยลบคอลัมน์เก่า
ลบ unique ของ project_id ด้วย — หลายไฟล์ (TOR + สัญญา) ผูกโปรเจคเดียวกันได้

Revision ID: d0f2a4b6c8e3
Revises: c9e5a1b7d3f2
Create Date: 2026-09-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd0f2a4b6c8e3'
down_revision: Union[str, Sequence[str], None] = 'c9e5a1b7d3f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('case_files', sa.Column('title', sa.Text(), nullable=False, server_default=''))
    op.add_column('case_files', sa.Column('doc_number', sa.String(length=60), nullable=True))
    op.add_column('case_files', sa.Column('agency', sa.String(length=160), nullable=True))
    op.add_column('case_files', sa.Column('deadline', sa.Date(), nullable=True))
    op.add_column('case_files', sa.Column('status', sa.String(length=20), nullable=False, server_default='received'))
    op.add_column('case_files', sa.Column('project_id', sa.String(length=36), nullable=True))
    op.create_foreign_key(
        'fk_case_files_project', 'case_files', 'projects', ['project_id'], ['id'], ondelete='SET NULL'
    )

    # ย้ายค่าจาก Document ลงทุกไฟล์ในนั้น — ชื่อเรื่องตั้งต้นจากชื่อไฟล์ตัดนามสกุล
    op.execute(
        """
        UPDATE case_files f
        SET title = regexp_replace(f.filename, '\\.[^.]+$', ''),
            doc_number = c.doc_number,
            agency = c.agency,
            deadline = c.deadline,
            status = c.status,
            project_id = c.project_id
        FROM cases c
        WHERE c.id = f.case_id
        """
    )

    op.drop_constraint('cases_project_id_key', 'cases', type_='unique')
    op.drop_constraint('cases_project_id_fkey', 'cases', type_='foreignkey')
    op.drop_column('cases', 'project_id')
    op.drop_column('cases', 'status')
    op.drop_column('cases', 'deadline')
    op.drop_column('cases', 'agency')
    op.drop_column('cases', 'doc_number')


def downgrade() -> None:
    op.add_column('cases', sa.Column('doc_number', sa.String(length=60), nullable=True))
    op.add_column('cases', sa.Column('agency', sa.String(length=160), nullable=True))
    op.add_column('cases', sa.Column('deadline', sa.Date(), nullable=True))
    op.add_column('cases', sa.Column('status', sa.String(length=20), nullable=False, server_default='received'))
    op.add_column('cases', sa.Column('project_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('cases_project_id_fkey', 'cases', 'projects', ['project_id'], ['id'], ondelete='SET NULL')
    op.create_unique_constraint('cases_project_id_key', 'cases', ['project_id'])
    op.drop_constraint('fk_case_files_project', 'case_files', type_='foreignkey')
    for col in ('project_id', 'status', 'deadline', 'agency', 'doc_number', 'title'):
        op.drop_column('case_files', col)
