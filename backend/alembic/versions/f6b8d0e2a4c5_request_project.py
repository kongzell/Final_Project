"""document request project

คำขอเอกสารระบุโปรเจคได้ — ยื่นจากบอร์ดโปรเจค เอกสารที่ได้รับจะผูกโปรเจคนั้นให้เลย

Revision ID: f6b8d0e2a4c5
Revises: e5a7c9d1b3f4
Create Date: 2026-09-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f6b8d0e2a4c5'
down_revision: Union[str, Sequence[str], None] = 'e5a7c9d1b3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('document_requests', sa.Column('project_id', sa.String(length=36), nullable=True))
    op.create_foreign_key(
        'fk_document_requests_project', 'document_requests', 'projects', ['project_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_document_requests_project', 'document_requests', type_='foreignkey')
    op.drop_column('document_requests', 'project_id')
