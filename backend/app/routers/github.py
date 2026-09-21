"""GitHub Activity feed + ตัวรับ webhook

บน localhost ตัว webhook จะไม่มีอะไรยิงเข้ามา (GitHub เข้าถึงเครื่องไม่ได้)
แต่ endpoint ทำงานได้จริง ทดสอบได้ด้วยการ POST payload ตัวอย่างเข้ามาเอง
"""

import hashlib
import hmac
import re

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ai, mailer, notify
from app.auth import require_member
from app.config import get_settings
from app.db import SessionLocal, get_session
from app.models import Member, Project, Task, WebhookEvent, apply_status_change
from app.schemas import (
    CommitOut,
    GithubRepo,
    ImportResult,
    MemberOut,
    TaskOut,
    WebhookEventOut,
)
from app.serialize import task_out

router = APIRouter(prefix="/api/github", tags=["github"])

#: รหัสงานในข้อความ commit เช่น "แก้ UI หน้าล็อกอิน KST-001"
#: ส่วนหน้าคือ task_prefix ของโปรเจค ส่วนหลังคือเลขงาน ใส่ # นำหน้าหรือไม่ก็ได้
TASK_REF = re.compile(r"#?\b([A-Za-z][A-Za-z0-9]{0,9})-0*(\d+)\b")


def _read_ref(text: str) -> str | None:
    """ดึงรหัสงานจากข้อความ คืนรูปแบบมาตรฐานตัวใหญ่ เช่น "KST-1" -> "KST-001\""""
    match = TASK_REF.search(text)
    if match is None:
        return None
    return f"{match.group(1).upper()}-{int(match.group(2)):03d}"


async def _advance_referenced_tasks(
    session: AsyncSession,
    repo: str | None,
    refs: list[str],
    status: str,
    branch: str | None = None,
    review_url: str | None = None,
) -> list[tuple[Project, Task]]:
    """ย้ายการ์ดที่ commit หรือ PR อ้างถึงไปยังสถานะที่กำหนด — คืนรายการที่ย้ายจริง

    หาเฉพาะโปรเจคที่ผูกกับ repo ที่ยิงเข้ามา ทำให้รหัสย่อซ้ำกันข้าม repo ไม่กวนกัน
    งานที่ปิดไปแล้วไม่ถูกดึงกลับ เพราะ commit ตามหลังการปิดงานเป็นเรื่องปกติ
    ตีกลับ (ไป in-progress) ทำได้เฉพาะงานที่รอตรวจอยู่ — ปิด PR ที่ไม่เกี่ยวไม่ควรดึงงานที่ยังไม่ส่งตรวจ
    """
    if not repo or not refs:
        return []

    projects = list(
        await session.scalars(select(Project).where(Project.github_repo == repo))
    )
    if not projects:
        return []

    moved: list[tuple[Project, Task]] = []
    for ref in set(refs):
        prefix, _, number = ref.rpartition("-")
        for project in projects:
            if project.task_prefix.upper() != prefix:
                continue
            task = await session.scalar(
                select(Task).where(
                    Task.project_id == project.id, Task.number == int(number)
                )
            )
            if task is None or task.status == "complete":
                continue
            if status == "in-progress" and task.status != "review":
                continue

            # เก็บที่อยู่ของโค้ดไว้เสมอ แม้สถานะจะไม่ได้เปลี่ยน
            # จะได้กดจากการ์ดไปดู diff ได้ตอนตรวจงาน
            if branch:
                task.branch = branch
            if review_url:
                task.review_url = review_url

            if task.status != status:
                apply_status_change(task, status)
                moved.append((project, task))

    await session.commit()
    return moved


def _code_location(event: str, payload: dict) -> tuple[str | None, str | None]:
    """ที่อยู่ของโค้ดที่แก้ — (ชื่อ branch, ลิงก์ PR)

    push ให้ branch มาใน ref ส่วน PR ให้ทั้ง branch ต้นทางและลิงก์หน้า PR
    branch หลักไม่เก็บ เพราะลิงก์เทียบ diff ของ main กับตัวเองจะว่างเปล่า
    """
    default = (payload.get("repository") or {}).get("default_branch")

    if event == "push":
        ref = payload.get("ref") or ""
        branch = ref.removeprefix("refs/heads/") if ref.startswith("refs/heads/") else None
        return (None if branch == default else branch), None

    if event in ("pull_request", "pull_request_review"):
        pr = payload.get("pull_request") or {}
        branch = ((pr.get("head") or {}).get("ref")) or None
        return (None if branch == default else branch), pr.get("html_url")

    return None, None


async def _suggest_matches(repo: str | None, event_ids: list[str]) -> None:
    """ให้ AI เดาว่า commit ที่ไม่มีรหัสงาน ตรงกับงานใบไหน แล้วเก็บไว้เป็นข้อเสนอ

    ทำงานหลังตอบ webhook ไปแล้ว เพราะ Gemini ใช้เวลาราว 15 วินาที ส่วน GitHub
    รอแค่ 10 วินาทีก็ถือว่า timeout — ถ้ารอในนั้นจะขึ้นแดงทั้งที่ระบบทำงานปกติ

    เปิด session ใหม่เอง เพราะ session ของ request ถูกปิดไปพร้อมกับ response แล้ว
    """
    if not repo or not event_ids:
        return

    async with SessionLocal() as session:
        projects = list(
            await session.scalars(select(Project).where(Project.github_repo == repo))
        )
        if not projects:
            return

        # เสนอเฉพาะงานที่ยังไม่ปิด — งานที่เสร็จแล้วไม่ควรถูกดึงกลับ
        open_tasks = list(
            await session.scalars(
                select(Task).where(
                    Task.project_id.in_([p.id for p in projects]),
                    Task.status != "complete",
                )
            )
        )
        if not open_tasks:
            return

        by_number = {t.number: t for t in open_tasks}
        candidates = [
            {"number": t.number, "title": t.title, "category": t.category} for t in open_tasks
        ]

        for event_id in event_ids:
            event = await session.get(WebhookEvent, event_id)
            if event is None:
                continue
            guess = await ai.match_commit(event.summary, candidates)
            if guess is None:
                continue
            task = by_number.get(guess["number"])
            if task is None:
                continue
            event.suggested_task_id = task.id
            event.suggest_confidence = guess["confidence"]
            event.suggest_reason = guess["reason"]

        await session.commit()


def _target_status(event: str, payload: dict) -> str | None:
    """สถานะปลายทางของการ์ดที่ event นี้อ้างถึง — None = event นี้ไม่ย้ายการ์ด

    push / เปิด PR = ส่งเข้าคิวตรวจ · PR ถูก merge = ผ่านการตรวจ -> ปิดงาน
    PR ถูกขอแก้ (Request changes) หรือปิดโดยไม่ merge = ตีกลับ -> กลับไปกำลังทำ + การ์ดแดง
    การ merge เข้า main ทำได้เฉพาะคนที่ ruleset อนุญาต ซึ่งตั้งไว้ให้เป็นเจ้าของ repo
    การปิดงานอัตโนมัติจึงเท่ากับเจ้าของกดรับงานเอง
    """
    if event == "pull_request":
        pr = payload.get("pull_request") or {}
        if payload.get("action") == "closed":
            return "complete" if pr.get("merged") else "in-progress"
        return "review"
    if event == "pull_request_review":
        state = ((payload.get("review") or {}).get("state") or "").lower()
        return "in-progress" if state == "changes_requested" else None
    if event == "push":
        return "review"
    return None


# สีสุ่มให้คนที่ดึงเข้ามาใหม่ ให้ avatar แยกกันออกตอนยังไม่มีรูป
IMPORT_COLORS = ["#7b68ee", "#3b82f6", "#ec4899", "#22c55e", "#f5a524", "#14b8a6", "#a855f7"]


async def _github_get(token: str, url: str, params: dict | None = None) -> list | dict:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.get(url, headers=headers, params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Could not reach GitHub ({type(exc).__name__})") from exc

    if res.status_code == 401:
        raise HTTPException(401, "Your GitHub token expired — sign out and sign in again")
    if res.status_code == 403:
        raise HTTPException(
            403,
            "Your token cannot read repos yet — sign out, sign in again and press Authorize "
            "to grant the extra scope (or you have no push access to this repo)",
        )
    if res.status_code != 200:
        raise HTTPException(502, f"GitHub responded with {res.status_code}: {res.text[:200]}")
    return res.json()


def _need_token(member: Member) -> str:
    token = member.token
    if not token:
        raise HTTPException(
            400,
            "This account did not sign in through GitHub — sign out and use 'Sign in with GitHub'",
        )
    return token


async def _upsert_people(
    session: AsyncSession, token: str, people: list[dict]
) -> tuple[int, int, list[Member]]:
    """สร้าง/อัปเดต member จากรายชื่อ GitHub — จับคู่ด้วย github_id"""
    created = 0
    updated = 0
    touched: list[Member] = []

    for index, person in enumerate(people):
        github_id = str(person["id"])
        existing = await session.scalar(select(Member).where(Member.github_id == github_id))

        if existing is None:
            # รายชื่อจาก GitHub ให้แค่ login กับรูป ต้องถามโปรไฟล์เพิ่มถ้าอยากได้ชื่อจริง
            profile = await _github_get(token, f"https://api.github.com/users/{person['login']}")
            existing = Member(
                name=profile.get("name") or person["login"],
                # GitHub ไม่มีข้อมูลว่าถนัดสายไหน ต้องให้เจ้าตัวเลือกเองทีหลัง
                role="Member",
                color=IMPORT_COLORS[index % len(IMPORT_COLORS)],
                github_id=github_id,
                email=profile.get("email"),
            )
            session.add(existing)
            created += 1
        else:
            updated += 1

        existing.github_login = person["login"]
        existing.avatar_url = person.get("avatar_url")
        touched.append(existing)

    await session.commit()
    for m in touched:
        await session.refresh(m)
    return created, updated, touched


async def auto_join_projects(session: AsyncSession, member: Member) -> list[str]:
    """ใส่คนที่เพิ่งล็อกอินเข้าโปรเจคที่ผูกกับ repo ที่เขามีสิทธิ์ push

    ไม่งั้นคนที่ถูกเชิญเข้า repo แล้วมาล็อกอินเองจะเจอหน้าเปล่า
    ต้องรอเจ้าของโปรเจคกดดึง collaborator ให้ก่อนถึงจะเห็นอะไร

    เรียกทุกครั้งที่ล็อกอิน ไม่ใช่แค่ครั้งแรก จะได้รับ repo ที่เพิ่งถูกเชิญเข้าไปด้วย
    คืนชื่อโปรเจคที่เพิ่งเข้าไป (ว่างถ้าไม่มีอะไรเปลี่ยน)
    """
    token = member.token
    if not token:
        return []

    try:
        rows = await _github_get(
            token,
            "https://api.github.com/user/repos",
            {"affiliation": "owner,collaborator,organization_member", "per_page": 100},
        )
    except HTTPException:
        # GitHub ล่มหรือ token หมดสิทธิ์ ก็ต้องล็อกอินผ่านอยู่ดี แค่ไม่ได้ auto-join
        return []

    repos = {r["full_name"] for r in rows if (r.get("permissions") or {}).get("push")}
    if not repos:
        return []

    joined: list[str] = []
    projects = await session.scalars(select(Project).where(Project.github_repo.in_(repos)))
    for project in projects:
        if member.id not in {m.id for m in project.members}:
            project.members.append(member)
            joined.append(project.name)

    if joined:
        await session.commit()
    return joined


@router.get("/repos", response_model=list[GithubRepo])
async def my_repos(member: Member = Depends(require_member)) -> list[dict]:
    """repo ที่คนล็อกอินมีสิทธิ์ push — อ่าน collaborator ได้เฉพาะ repo พวกนี้"""
    rows = await _github_get(
        _need_token(member),
        "https://api.github.com/user/repos",
        {
            "affiliation": "owner,collaborator,organization_member",
            "sort": "updated",
            "per_page": 100,
        },
    )
    return [
        {
            "full_name": r["full_name"],
            "private": r.get("private", False),
            "collaborator_count": None,
        }
        for r in rows
        if (r.get("permissions") or {}).get("push")
    ]


@router.post("/import-collaborators", response_model=ImportResult)
async def import_collaborators(
    repo: str,
    member: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> ImportResult:
    """ดึง collaborator ของ repo มาสร้างเป็นพนักงาน

    ต่างจาก org ตรงที่เห็นทุกคนที่ถูกเชิญเข้า repo แม้ยังไม่เคย commit
    """
    token = _need_token(member)
    people = await _github_get(
        token, f"https://api.github.com/repos/{repo}/collaborators", {"per_page": 100}
    )

    # GitHub นับเป็น collaborator เฉพาะคนที่กดรับคำเชิญแล้ว
    # คนที่ยังไม่ตอบรับอยู่อีก endpoint หนึ่ง — ดึงมาด้วยจะได้ไม่ต้องรอ
    pending: list[dict] = []
    try:
        invites = await _github_get(
            token, f"https://api.github.com/repos/{repo}/invitations", {"per_page": 100}
        )
        pending = [i["invitee"] for i in invites if i.get("invitee")]
    except HTTPException:
        # ต้องมีสิทธิ์ admin ถึงจะอ่านคำเชิญได้ — ถ้าอ่านไม่ได้ก็ข้ามไป
        pending = []

    seen = {str(p["id"]) for p in people}
    everyone = people + [p for p in pending if str(p["id"]) not in seen]

    created, updated, touched = await _upsert_people(session, token, everyone)
    return ImportResult(
        org=repo,
        created=created,
        updated=updated,
        pending=len(pending),
        members=[MemberOut.model_validate(m) for m in touched],
    )


@router.get("/commits", response_model=list[CommitOut])
async def commits(
    project_id: str,
    limit: int = 10,
    member: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> list[CommitOut]:
    """commit ล่าสุดของ repo ที่โปรเจคนี้ผูกอยู่ — ต้องเป็นสมาชิกโปรเจค

    ใช้ token ของคนดูถ้ามี (repo ส่วนตัว) ไม่มีก็ยิงแบบไม่ล็อกอิน ซึ่งอ่านได้เฉพาะ repo สาธารณะ
    """
    project = await session.get(Project, project_id)
    if project is None or member.id not in {m.id for m in project.members}:
        raise HTTPException(404, f"Project {project_id} not found")
    if not project.github_repo:
        return []

    url = f"https://api.github.com/repos/{project.github_repo}/commits"
    headers = {"Accept": "application/vnd.github+json"}
    # repo ส่วนตัวต้องมี token ถึงจะอ่านได้ — ใช้ของคนที่ล็อกอินอยู่
    if member is not None and member.token:
        headers["Authorization"] = f"Bearer {member.token}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.get(url, headers=headers, params={"per_page": min(limit, 30)})
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Could not reach GitHub ({type(exc).__name__})") from exc

    if res.status_code != 200:
        raise HTTPException(502, f"GitHub responded with {res.status_code}: {res.text[:200]}")

    out: list[CommitOut] = []
    for row in res.json():
        message = (row.get("commit", {}).get("message") or "").split("\n")[0]
        out.append(
            CommitOut(
                sha=row["sha"][:7],
                message=message,
                author=(row.get("author") or {}).get("login")
                or row.get("commit", {}).get("author", {}).get("name", "unknown"),
                date=row.get("commit", {}).get("author", {}).get("date", ""),
                url=row.get("html_url", ""),
                task_ref=_read_ref(message),
            )
        )
    return out


@router.get("/events", response_model=list[WebhookEventOut])
async def events(
    project_id: str,
    limit: int = 20,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> list[WebhookEventOut]:
    """เฉพาะ event ของ repo ที่โปรเจคนี้ผูกอยู่ — และต้องเป็นสมาชิกโปรเจคถึงจะเห็น

    เดิมคืนทุก event ให้ทุกคน ซึ่งพอเปิดสมัครบัญชีธรรมดาได้แปลว่าใครก็เห็นงานของทุกโปรเจค
    """
    project = await session.get(Project, project_id)
    if project is None or me.id not in {m.id for m in project.members}:
        raise HTTPException(404, f"Project {project_id} not found")
    if not project.github_repo:
        return []

    rows = list(
        await session.scalars(
            select(WebhookEvent)
            .where(WebhookEvent.repo == project.github_repo)
            .order_by(desc(WebhookEvent.received_at))
            .limit(min(limit, 100))
        )
    )

    # เติมรหัสกับชื่อของงานที่ AI เสนอ ให้หน้าเว็บแสดงได้โดยไม่ต้องยิงถามซ้ำทีละใบ
    wanted = {r.suggested_task_id for r in rows if r.suggested_task_id}
    tasks: dict[str, tuple[str, str]] = {}
    if wanted:
        found = await session.scalars(
            select(Task, Project)
            .join(Project, Project.id == Task.project_id)
            .where(Task.id.in_(wanted))
        )
        for task in found:
            project = await session.get(Project, task.project_id)
            key = f"{project.task_prefix}-{task.number:03d}" if project else str(task.number)
            tasks[task.id] = (key, task.title)

    out = []
    for r in rows:
        info = tasks.get(r.suggested_task_id or "")
        out.append(
            WebhookEventOut(
                id=r.id,
                event=r.event,
                summary=r.summary,
                actor=r.actor,
                url=r.url,
                task_ref=r.task_ref,
                suggested_task_id=r.suggested_task_id if info else None,
                suggested_task_key=info[0] if info else None,
                suggested_task_title=info[1] if info else None,
                suggest_confidence=r.suggest_confidence if info else None,
                suggest_reason=r.suggest_reason if info else None,
                received_at=r.received_at,
            )
        )
    return out


@router.post("/events/{event_id}/apply", response_model=TaskOut)
async def apply_suggestion(
    event_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    """ยืนยันข้อเสนอของ AI แล้วย้ายการ์ดไป "รอตรวจ"

    เจ้าของโปรเจคเท่านั้น เพราะเป็นการเปลี่ยนสถานะงานของทีม
    ลบข้อเสนอทิ้งหลังใช้ จะได้ไม่ค้างให้กดซ้ำ
    """
    event = await session.get(WebhookEvent, event_id)
    if event is None or not event.suggested_task_id:
        raise HTTPException(404, "Suggestion not found — it may already have been applied")

    task = await session.get(Task, event.suggested_task_id)
    if task is None:
        raise HTTPException(404, "The suggested task has been deleted")

    project = await session.get(Project, task.project_id)
    if project is None or not project.can_manage(me.id):
        raise HTTPException(403, "Only the project owner or an admin can confirm a suggestion")

    if task.status != "complete":
        apply_status_change(task, "review")

    event.suggested_task_id = None
    event.suggest_confidence = None
    event.suggest_reason = None
    event.task_ref = f"{project.task_prefix}-{task.number:03d}"

    await session.commit()
    await session.refresh(task)
    return task_out(task)


@router.post("/webhook", status_code=202)
async def webhook(
    request: Request,
    background: BackgroundTasks,
    x_github_event: str = Header(default="ping"),
    x_hub_signature_256: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int | str]:
    """รับ event จาก GitHub แล้วเก็บลง webhook_events"""
    settings = get_settings()
    body = await request.body()

    if settings.github_webhook_secret:
        expected = "sha256=" + hmac.new(
            settings.github_webhook_secret.encode(), body, hashlib.sha256
        ).hexdigest()
        if not x_hub_signature_256 or not hmac.compare_digest(expected, x_hub_signature_256):
            raise HTTPException(401, "Invalid signature")

    payload = await request.json()
    repo = (payload.get("repository") or {}).get("full_name")
    rows = _summarize(x_github_event, payload)
    saved = [
        WebhookEvent(
            event=x_github_event, summary=summary, actor=actor, url=url, task_ref=ref, repo=repo
        )
        for summary, actor, url, ref in rows
    ]
    session.add_all(saved)
    await session.commit()

    refs = [ref for *_, ref in rows if ref]
    status = _target_status(x_github_event, payload)
    branch, review_url = _code_location(x_github_event, payload)
    moved: list[tuple[Project, Task]] = []
    if status:
        moved = await _advance_referenced_tasks(session, repo, refs, status, branch, review_url)

    # ถูกตีกลับจาก GitHub — คนรับงานต้องรู้ทันที เพราะไม่ได้เป็นคนกดเอง
    if status == "in-progress":
        who = (payload.get("sender") or {}).get("login") or "GitHub"
        reason = "PR ถูกขอให้แก้ไข (Request changes)" if x_github_event == "pull_request_review" else "PR ถูกปิดโดยไม่ merge"
        for project, task in moved:
            to = await notify.emails_of(session, {m.id for m in task.assignees})
            if to:
                subject, body = notify.task_reworked(project, task, who, reason, review_url)
                background.add_task(mailer.send, to, subject, body)

    # commit ที่ลืมใส่รหัสงาน ให้ AI เดาให้ทีหลัง แล้วเก็บไว้รอคนยืนยัน
    unmatched = [e.id for e, (*_, ref) in zip(saved, rows, strict=True) if not ref]
    if unmatched:
        background.add_task(_suggest_matches, repo, unmatched)

    return {"saved": len(saved), "moved": len(moved), "status": status or ""}


def _summarize(event: str, payload: dict) -> list[tuple[str, str | None, str | None, str | None]]:
    """แปลง payload ดิบให้เป็นบรรทัดสั้น ๆ ที่เอาไปแสดงได้เลย"""
    if event == "push":
        rows = []
        # payload บางแบบไม่มี url ราย commit — ใช้ลิงก์ compare ของทั้ง push แทน
        # จะได้กดจากแถบกิจกรรมไปดูโค้ดได้เสมอ
        fallback = payload.get("compare")
        for commit in payload.get("commits", []):
            message = (commit.get("message") or "").split("\n")[0]
            rows.append(
                (
                    message,
                    (commit.get("author") or {}).get("username")
                    or (commit.get("author") or {}).get("name"),
                    commit.get("url") or fallback,
                    _read_ref(message),
                )
            )
        return rows

    if event == "pull_request":
        pr = payload.get("pull_request", {})
        action = payload.get("action", "")
        title = pr.get("title", "")
        # รหัสงานมักเขียนไว้ในรายละเอียด PR ("Closes KST-003") ไม่ใช่ในชื่อเสมอไป
        merged = " (merged)" if pr.get("merged") else ""
        return [
            (
                f"PR {action}{merged}: {title}",
                (pr.get("user") or {}).get("login"),
                pr.get("html_url"),
                _read_ref(title) or _read_ref(pr.get("body") or ""),
            )
        ]

    if event == "pull_request_review":
        pr = payload.get("pull_request") or {}
        review = payload.get("review") or {}
        state = (review.get("state") or "").lower().replace("_", " ")
        return [
            (
                f"PR review ({state}): {pr.get('title', '')}",
                (review.get("user") or {}).get("login"),
                review.get("html_url") or pr.get("html_url"),
                _read_ref(pr.get("title") or "") or _read_ref(pr.get("body") or ""),
            )
        ]

    return [(f"event: {event}", (payload.get("sender") or {}).get("login"), None, None)]
