"""unique task prefix per repo

repo เดียวผูกหลายโปรเจคได้ แต่รหัสย่อตั้งจากชื่อ repo โปรเจคที่ผูก repo เดียวกันจึงได้รหัสเดียวกัน
commit ที่อ้าง KST-001 เลยย้ายงานเลข 1 ของทุกโปรเจคพร้อมกัน

แก้ของเดิมก่อน — โปรเจคแรกที่สร้างเก็บรหัสเดิม ที่เหลือต่อเลขท้าย KST2, KST3 …
แล้วค่อยสร้าง unique index ไม่งั้นสร้าง index ไม่ผ่านเพราะแถวเก่าซ้ำกันอยู่

Revision ID: c1e3a5b7d9f0
Revises: b8d0f2a4c6e7
Create Date: 2026-11-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c1e3a5b7d9f0'
down_revision: Union[str, Sequence[str], None] = 'b8d0f2a4c6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _free_prefix(base: str, taken: set[str]) -> str:
    """สำเนาจาก routers/projects.py — migration ห้าม import โค้ดแอปที่อาจเปลี่ยนทีหลัง"""
    if base.upper() not in taken:
        return base
    n = 2
    while True:
        suffix = str(n)
        candidate = base[: 10 - len(suffix)] + suffix
        if candidate.upper() not in taken:
            return candidate
        n += 1


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, github_repo, task_prefix FROM projects "
        "WHERE github_repo IS NOT NULL ORDER BY created_at, id"
    )).all()

    # รอบแรกจองรหัสที่ยังไม่ซ้ำไว้ก่อนทั้งหมด รอบสองค่อยต่อเลขให้ตัวที่ซ้ำ
    # ไม่งั้นโปรเจคที่ตั้ง KST2 ไว้เองอยู่แล้วจะโดนเลื่อนเป็น KST3 ทั้งที่ไม่ได้ชนกับใคร
    taken: dict[str, set[str]] = {}
    duplicates: list[tuple[str, str, str]] = []
    for project_id, repo, prefix in rows:
        used = taken.setdefault(repo, set())
        if prefix.upper() in used:
            duplicates.append((project_id, repo, prefix))
        else:
            used.add(prefix.upper())

    for project_id, repo, prefix in duplicates:
        new_prefix = _free_prefix(prefix, taken[repo])
        taken[repo].add(new_prefix.upper())
        bind.execute(
            sa.text("UPDATE projects SET task_prefix = :prefix WHERE id = :id"),
            {"prefix": new_prefix, "id": project_id},
        )

    op.create_index(
        'uq_projects_repo_prefix',
        'projects',
        ['github_repo', sa.text('upper(task_prefix)')],
        unique=True,
        postgresql_where=sa.text('github_repo IS NOT NULL'),
    )


def downgrade() -> None:
    # รหัสที่ถูกต่อเลขไปแล้วไม่ย้อนกลับ — ย้อนแล้ว commit จะกลับไปชนกันเหมือนเดิม
    op.drop_index('uq_projects_repo_prefix', table_name='projects')
