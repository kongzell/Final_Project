from app.models import Project, Task
from app.schemas import ProjectOut, TaskOut


def _actual_hours(task: Task) -> float | None:
    """เวลาที่ใช้จริง (ชม.) จาก started_at ถึง completed_at — None ถ้ายังไม่เริ่มหรือยังไม่เสร็จ

    ต่างจาก estimate_hours ตรงที่ตัวนี้คำนวณจากเวลาจริงที่ผ่านไป ไม่ใช่ตัวเลขที่ AI เดาไว้ล่วงหน้า
    """
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
        branch=task.branch,
        review_url=task.review_url,
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
