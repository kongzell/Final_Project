from app.models import Case, CaseFile, DocumentRequest, Project, Task
from app.schemas import CaseFileOut, CaseOut, DocumentRequestOut, ProjectOut, TaskOut


def _actual_hours(task: Task) -> float | None:
    if task.started_at is None or task.completed_at is None:
        return None
    seconds = (task.completed_at - task.started_at).total_seconds()
    return round(max(seconds, 0) / 3600, 1)


def task_out(task: Task) -> TaskOut:
    return TaskOut(
        id=task.id,
        number=task.number,
        parent_id=task.parent_id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        position=task.position,
        assignee_ids=[m.id for m in task.assignees],
        category=task.category,
        tags=task.tags or [],
        estimate_hours=task.estimate_hours,
        complexity=task.complexity,
        needs_rework=task.needs_rework,
        rework_count=task.rework_count,
        completed_at=task.completed_at,
        started_at=task.started_at,
        actual_hours=_actual_hours(task),
        depends_on=task.depends_on or [],
        source_file_id=task.source_file_id,
        branch=task.branch,
        review_url=task.review_url,
    )


def file_out(f: CaseFile) -> CaseFileOut:
    """เฉพาะ metadata — ตัวไฟล์ (data) ไม่ออกทางนี้เด็ดขาด ไม่งั้นรายการเรื่องหนักหลาย MB"""
    return CaseFileOut(
        id=f.id,
        title=f.title,
        status=f.status,
        doc_number=f.doc_number,
        agency=f.agency,
        deadline=f.deadline,
        project_id=f.project_id,
        filename=f.filename,
        content_type=f.content_type,
        size=f.size,
        category=f.category,
        version=f.version,
        replaces_id=f.replaces_id,
        uploaded_by=f.uploaded_by,
        uploaded_at=f.uploaded_at,
    )


def request_out(r: DocumentRequest) -> DocumentRequestOut:
    return DocumentRequestOut(
        id=r.id,
        from_case_id=r.from_case_id,
        to_case_id=r.to_case_id,
        requested_by=r.requested_by,
        title=r.title,
        note=r.note,
        status=r.status,
        file_id=r.file_id,
        project_id=r.project_id,
        reply=r.reply,
        resolved_by=r.resolved_by,
        resolved_at=r.resolved_at,
        created_at=r.created_at,
    )


def case_out(case: Case) -> CaseOut:
    return CaseOut(
        id=case.id,
        title=case.title,
        owner_id=case.owner_id,
        member_ids=[m.id for m in case.members],
        admin_ids=sorted(case.admin_ids),
        files=[file_out(f) for f in case.files],
        requests_out=[request_out(r) for r in case.requests_out],
        requests_in=[request_out(r) for r in case.requests_in],
        created_at=case.created_at,
    )


def project_out(project: Project) -> ProjectOut:
    return ProjectOut(
        id=project.id,
        name=project.name,
        github_repo=project.github_repo,
        owner_id=project.owner_id,
        task_prefix=project.task_prefix,
        member_ids=[m.id for m in project.members],
        admin_ids=sorted(project.admin_ids),
        tasks=[task_out(t) for t in sorted(project.tasks, key=lambda t: t.position)],
    )
