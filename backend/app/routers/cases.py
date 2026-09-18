"""หน้า Documents — Document 1 อัน = ที่เก็บเอกสารกลางของทีม เอกสารทุกเรื่องส่งเข้าที่นี่

เอกสารแต่ละใบมีเรื่อง/เลขที่/กำหนดส่ง/สถานะ/โปรเจคของตัวเอง (ดู CaseFile) —
ตัว Document มีแค่ชื่อกับสมาชิก

สิทธิ์ล้อกับโปรเจค: สมาชิกดู/ส่งเอกสาร · คนส่งแก้ข้อมูลใบของตัวเองได้ · เจ้าของหรือ admin
แก้ได้ทุกใบและจัดการคน · เจ้าของคนเดียวลบไฟล์ ลบที่เก็บ ตั้ง admin — เอกสารราชการไม่ควรลบง่าย

ผูกโปรเจคเป็นรายใบ และคนผูกต้องมีสิทธิ์ทั้งสองฝั่ง ไม่งั้นฝ่ายเอกสารจะยิงงานเข้าบอร์ด
ของทีมที่ตัวเองไม่ได้อยู่ได้
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import ai, mailer, notify
from app.auth import require_member
from app.db import get_session
from app.models import Case, CaseFile, DocumentRequest, Member, Project, case_members
from app.schemas import (
    BreakdownResult,
    CaseCreate,
    CaseDirectoryEntry,
    CaseFileUpdate,
    DocumentRequestCreate,
    DocumentRequestDecline,
    DocumentRequestFulfill,
    CaseOut,
    CaseUpdate,
    FileBreakdownRequest,
    FileMetadata,
    MemberRoleUpdate,
)
from app.serialize import case_out

router = APIRouter(prefix="/api/cases", tags=["documents"])
log = logging.getLogger("notify")

#: เพดานต่อไฟล์ — Neon ฟรีมีที่ 0.5 GB ทั้งฐานข้อมูล ไม่ใช่แค่ไฟล์
MAX_FILE_BYTES = 5 * 1024 * 1024

#: ชนิดไฟล์ที่รับ — เอกสารสำนักงานกับรูป พอสำหรับหนังสือราชการ
ALLOWED_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg",
    "text/plain",
}

CATEGORIES = {"tor", "contract", "amendment", "minutes", "acceptance", "other"}


async def _get_case(session: AsyncSession, case_id: str, me: Member) -> Case:
    """ที่เก็บที่ me เป็นสมาชิก — คนนอกได้ 404 เหมือนโปรเจค ไม่ยืนยันว่า id นี้มีจริง"""
    case = await session.get(Case, case_id)
    if case is None or me.id not in {m.id for m in case.members}:
        raise HTTPException(404, f"Document {case_id} not found")
    return case


async def _get_managed_case(session: AsyncSession, case_id: str, me: Member) -> Case:
    case = await _get_case(session, case_id, me)
    if not case.can_manage(me.id):
        raise HTTPException(403, "Only the owner or an admin of this document can do this")
    return case


async def _get_owned_case(session: AsyncSession, case_id: str, me: Member) -> Case:
    case = await _get_case(session, case_id, me)
    if case.owner_id != me.id:
        raise HTTPException(403, "Only the owner of this document can do this")
    return case


async def _read_upload(upload: UploadFile) -> tuple[bytes, str, str]:
    """อ่านไฟล์พร้อมตรวจชนิดกับขนาด — ตรวจขนาดจาก bytes จริง ไม่เชื่อ header"""
    content_type = (upload.content_type or "application/octet-stream").split(";")[0].strip()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(415, "Only PDF, Word, Excel, images and plain text are accepted")
    data = await upload.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "File is larger than 5 MB")
    if not data:
        raise HTTPException(400, "The file is empty")
    return data, content_type, upload.filename or "document"


def _check_category(value: str) -> str:
    if value not in CATEGORIES:
        raise HTTPException(422, f"category must be one of: {', '.join(sorted(CATEGORIES))}")
    return value


def _parse_date(value: str | None) -> date | None:
    """ฟิลด์ form มาเป็น string — ว่างคือไม่ใส่"""
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "deadline must be YYYY-MM-DD") from None


async def _readable_file(session: AsyncSession, case_id: str, file_id: str, me: Member) -> CaseFile:
    """ไฟล์ที่ me เปิดดูได้ — สมาชิกของที่เก็บ หรือสมาชิกของโปรเจคที่ผูกไว้ คนนอกทั้งคู่ได้ 404"""
    f = await session.get(CaseFile, file_id, options=[selectinload(CaseFile.case)])
    if f is None or f.case_id != case_id:
        raise HTTPException(404, "File not found")
    if me.id in {m.id for m in f.case.members}:
        return f
    if f.project is not None and me.id in {m.id for m in f.project.members}:
        return f
    raise HTTPException(404, "File not found")


def _file_in(case: Case, file_id: str) -> CaseFile:
    f = next((x for x in case.files if x.id == file_id), None)
    if f is None:
        raise HTTPException(404, "File not found")
    return f


# ---------- ที่เก็บ ----------


@router.get("", response_model=list[CaseOut])
async def list_cases(
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> list[CaseOut]:
    rows = await session.scalars(
        select(Case)
        .join(case_members, case_members.c.case_id == Case.id)
        .where(case_members.c.member_id == me.id)
        .order_by(Case.created_at.desc())
    )
    return [case_out(c) for c in rows]


@router.get("/directory", response_model=list[CaseDirectoryEntry])
async def directory(
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> list[CaseDirectoryEntry]:
    """ที่เก็บทุกอันในระบบแบบย่อ — ไว้เลือกปลายทางตอนขอเอกสารข้ามทีม และแปลง id → ชื่อในแผงคำขอ

    เห็นแค่ชื่อกับจำนวนคน ไม่เห็นไฟล์ข้างใน — เหมือนรู้ว่าองค์กรมีฝ่ายไหนบ้าง
    ต้องประกาศก่อน /{case_id} ไม่งั้น "directory" จะถูกตีความเป็น id
    """
    rows = await session.execute(
        select(Case, func.count(case_members.c.member_id))
        .outerjoin(case_members, case_members.c.case_id == Case.id)
        .group_by(Case.id)
        .order_by(Case.title)
    )
    return [
        CaseDirectoryEntry(
            id=c.id,
            title=c.title,
            owner_id=c.owner_id,
            member_count=n,
            is_member=me.id in {m.id for m in c.members},
        )
        for c, n in rows
    ]


@router.post("", response_model=CaseOut, status_code=201)
async def create_case(
    payload: CaseCreate,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """สร้างที่เก็บด้วยชื่อ — เหมือนสร้างโปรเจค คนสร้างเป็นเจ้าของและสมาชิกคนแรก

    เอกสารส่งเข้ามาทีหลังผ่าน /files ทีละใบ แต่ละใบจะเกี่ยวโปรเจคหรือไม่ก็ได้
    """
    case = Case(title=payload.title.strip(), owner_id=me.id)
    case.members.append(me)
    session.add(case)
    await session.commit()
    await session.refresh(case)
    return case_out(case)


async def _linkable_project(session: AsyncSession, project_id: str, me: Member) -> Project:
    """โปรเจคที่ me ผูกเอกสารได้ — ต้องเป็นเจ้าของ/admin ของโปรเจคนั้น (หลายใบผูกโปรเจคเดียวกันได้)"""
    project = await session.get(Project, project_id)
    if project is None or me.id not in {m.id for m in project.members}:
        raise HTTPException(404, f"Project {project_id} not found")
    if not project.can_manage(me.id):
        raise HTTPException(403, "You need to be the owner or an admin of that project to link it")
    return project


@router.patch("/{case_id}", response_model=CaseOut)
async def update_case(
    case_id: str,
    payload: CaseUpdate,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """เปลี่ยนชื่อที่เก็บ — เจ้าของหรือ admin"""
    case = await _get_managed_case(session, case_id, me)
    case.title = payload.title.strip()
    await session.commit()
    await session.refresh(case)
    return case_out(case)


@router.delete("/{case_id}", status_code=204)
async def delete_case(
    case_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ลบที่เก็บพร้อมเอกสารทั้งหมด — งานที่เคยแตกจากไฟล์พวกนี้ยังอยู่ (source_file_id กลายเป็น null)"""
    case = await _get_owned_case(session, case_id, me)
    await session.delete(case)
    await session.commit()


# ---------- เอกสารในที่เก็บ ----------


@router.post("/{case_id}/files", response_model=CaseOut, status_code=201)
async def add_file(
    case_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    category: str = Form("other"),
    title: str | None = Form(None),
    doc_number: str | None = Form(None),
    agency: str | None = Form(None),
    deadline: str | None = Form(None),
    project_id: str | None = Form(None),
    replaces_id: str | None = Form(None),
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """ส่งเอกสารเข้าที่เก็บ — สมาชิกทุกคนทำได้ รับเป็น form เพราะมีไฟล์มาในคำขอเดียว

    เรื่องตั้งต้นจากชื่อไฟล์ถ้าไม่ส่งมา ผูกโปรเจคได้เลยตอนส่ง (ต้องมีสิทธิ์ในโปรเจคนั้น)
    ส่ง replaces_id มาเมื่อเป็นฉบับแก้ไขของใบเดิม — ได้เลขเวอร์ชันถัดไปและสืบทอด
    เรื่อง/เลขที่/โปรเจค/สถานะจากใบเดิม จะได้ไม่ต้องกรอกซ้ำ
    """
    case = await _get_case(session, case_id, me)
    data, content_type, filename = await _read_upload(file)
    cat = _check_category(category)

    new_file = CaseFile(
        filename=filename,
        content_type=content_type,
        size=len(data),
        category=cat,
        title=(title or "").strip() or filename.rsplit(".", 1)[0],
        doc_number=(doc_number or "").strip() or None,
        agency=(agency or "").strip() or None,
        deadline=_parse_date(deadline),
        data=data,
        uploaded_by=me.id,
    )
    if project_id:
        new_file.project_id = (await _linkable_project(session, project_id, me)).id

    if replaces_id:
        prev = next((f for f in case.files if f.id == replaces_id), None)
        if prev is None:
            raise HTTPException(404, "The file being replaced is not in this document")
        new_file.version = prev.version + 1
        new_file.replaces_id = prev.id
        new_file.category = prev.category
        new_file.status = prev.status
        if not (title or "").strip():
            new_file.title = prev.title
        new_file.doc_number = new_file.doc_number or prev.doc_number
        new_file.agency = new_file.agency or prev.agency
        new_file.deadline = new_file.deadline or prev.deadline
        new_file.project_id = new_file.project_id or prev.project_id

    case.files.append(new_file)
    await session.commit()
    await session.refresh(case)

    to = await notify.case_emails(session, case_id, exclude={me.id})
    if to:
        subject, body = notify.file_added(case, new_file, me)
        background.add_task(mailer.send, to, subject, body)
    else:
        candidates = len([m for m in case.members if m.id != me.id])
        log.info("file_added %s — ไม่ส่งแจ้งเตือน: ผู้ที่ควรได้รับ %d คน แต่กรอกอีเมลไว้ 0 คน", new_file.filename, candidates)

    return case_out(case)


@router.patch("/{case_id}/files/{file_id}", response_model=CaseOut)
async def update_file(
    case_id: str,
    file_id: str,
    payload: CaseFileUpdate,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """แก้ข้อมูลเอกสารใบเดียว — คนส่งใบนั้น หรือเจ้าของ/admin ของที่เก็บ"""
    case = await _get_case(session, case_id, me)
    f = _file_in(case, file_id)
    if f.uploaded_by != me.id and not case.can_manage(me.id):
        raise HTTPException(403, "Only the uploader, the owner or an admin can edit this document")
    data = payload.model_dump(exclude_unset=True)

    if "project_id" in data:
        new_id = data.pop("project_id")
        if new_id is not None and new_id != f.project_id:
            await _linkable_project(session, new_id, me)
        f.project_id = new_id

    for field, value in data.items():
        if field in ("title", "doc_number", "agency") and value is not None:
            value = value.strip() or (None if field != "title" else f.title)
        setattr(f, field, value)

    await session.commit()
    await session.refresh(case)
    return case_out(case)


@router.get("/{case_id}/files/{file_id}")
async def download_file(
    case_id: str,
    file_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """ตัวไฟล์ออกทางนี้ทางเดียว — inline ให้เบราว์เซอร์เปิด PDF ได้เลย

    เปิดได้ถ้าอยู่ในที่เก็บ หรือเป็นสมาชิกของโปรเจคที่ใบนี้ผูกอยู่ (ผูกโปรเจค = แชร์ให้ทีมโปรเจค)
    """
    f = await _readable_file(session, case_id, file_id, me)

    return Response(
        content=f.data,
        media_type=f.content_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(f.filename)}",
            "Cache-Control": "private, max-age=0",
        },
    )


@router.delete("/{case_id}/files/{file_id}", status_code=204)
async def delete_file(
    case_id: str,
    file_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    """เจ้าของเท่านั้น — ไฟล์ที่ถูกฉบับใหม่แทนที่อยู่จะหลุดเป็นฉบับปัจจุบันแทน (replaces_id SET NULL)"""
    case = await _get_owned_case(session, case_id, me)
    f = _file_in(case, file_id)
    await session.delete(f)
    await session.commit()


@router.post("/{case_id}/files/{file_id}/extract", response_model=FileMetadata)
async def extract_metadata(
    case_id: str,
    file_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> FileMetadata:
    """ให้ AI อ่านไฟล์ที่อัปโหลดไว้แล้ว เสนอเลขที่/หน่วยงาน/กำหนดส่ง — ยังไม่บันทึก หน้าเว็บเอาไปเติมเอง"""
    case = await _get_case(session, case_id, me)
    f = _file_in(case, file_id)
    return await ai.extract_metadata(f.filename, f.content_type, f.data)


@router.post("/{case_id}/files/{file_id}/breakdown", response_model=BreakdownResult)
async def breakdown_file(
    case_id: str,
    file_id: str,
    payload: FileBreakdownRequest,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> BreakdownResult:
    """ให้ AI อ่านไฟล์นี้แล้วเสนอการ์ดงาน — ยังไม่สร้างอะไร หน้าเว็บให้ผู้ใช้ตรวจก่อน

    ใบนั้นต้องผูกโปรเจคก่อนและคนกดต้องสร้างงานในโปรเจคนั้นได้ ไม่งั้นเสนอไปก็เอาไปลงที่ไหนไม่ได้
    เป็น opt-in ต่อไฟล์ เพราะกินโควตา Gemini และเนื้อหาออกไปนอกระบบ
    """
    f = await _readable_file(session, case_id, file_id, me)
    if f.project_id is None:
        raise HTTPException(400, "Link a project to this document first")
    if f.project is None or not f.project.can_manage(me.id):
        raise HTTPException(403, "You need to be the owner or an admin of the linked project")
    return await ai.breakdown(
        f.title, payload.context, payload.count, attachment=(f.filename, f.content_type, f.data)
    )


# ---------- ขอเอกสารข้ามที่เก็บ ----------


def _request_in(case: Case, request_id: str, *, incoming: bool) -> DocumentRequest:
    pool = case.requests_in if incoming else case.requests_out
    r = next((x for x in pool if x.id == request_id), None)
    if r is None:
        raise HTTPException(404, "Request not found")
    return r


@router.post("/{case_id}/requests", response_model=CaseOut, status_code=201)
async def create_request(
    case_id: str,
    payload: DocumentRequestCreate,
    background: BackgroundTasks,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """สมาชิกของที่เก็บ A ขอเอกสารจากที่เก็บ B — ไม่ต้องเป็นสมาชิกของ B

    ขอจากทีมตัวเอง (B = A) ก็ได้ — ใช้เป็นการฝากให้เพื่อนร่วมทีม/ผู้ดูแลอัปโหลดเอกสารที่ยังไม่มี
    แจ้งเจ้าของ/admin ของ B ทางอีเมล ผลลัพธ์กลับมาเป็น A (มี requests_out ใหม่)
    """
    case = await _get_case(session, case_id, me)
    target = await session.get(Case, payload.to_case_id)
    if target is None:
        raise HTTPException(404, f"Document {payload.to_case_id} not found")

    project_id = (await _linkable_project(session, payload.project_id, me)).id if payload.project_id else None
    req = DocumentRequest(
        from_case_id=case.id,
        to_case_id=target.id,
        requested_by=me.id,
        title=payload.title,
        note=payload.note.strip() or None,
        project_id=project_id,
    )
    session.add(req)
    await session.commit()
    await session.refresh(case)

    to = await notify.case_manager_emails(session, target, exclude={me.id})
    if to:
        subject, body = notify.document_requested(target, case, req, me)
        background.add_task(mailer.send, to, subject, body)
    else:
        log.info("document_requested %s — ไม่ส่งแจ้งเตือน: เจ้าของ/admin ของ %s ไม่มีอีเมล", req.title, target.title)
    return case_out(case)


@router.post("/{case_id}/requests/{request_id}/fulfill", response_model=CaseOut)
async def fulfill_request(
    case_id: str,
    request_id: str,
    payload: DocumentRequestFulfill,
    background: BackgroundTasks,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """ผู้ดูแลของที่เก็บที่ถูกขอ เลือกไฟล์ของตัวเองส่งให้ — คัดลอกเป็นแถวใหม่ในที่เก็บผู้ขอ

    สำเนาไม่พ่วงโปรเจค (โปรเจคเป็นเรื่องของฝั่งผู้ให้) ผู้ขอค่อยผูกเองถ้าต้องการ
    คำขอภายในทีมเดียวกันไม่ต้องคัดลอก — ชี้ไปไฟล์นั้นเลย ไม่งั้นได้ใบซ้ำในที่เก็บเดียว
    """
    case = await _get_managed_case(session, case_id, me)
    req = _request_in(case, request_id, incoming=True)
    if req.status != "pending":
        raise HTTPException(409, f"This request is already {req.status}")
    src = _file_in(case, payload.file_id)
    requester = await session.get(Case, req.from_case_id)
    if requester is None:
        raise HTTPException(404, "The requesting document space no longer exists")

    if requester.id == case.id:
        delivered_id = src.id
        if req.project_id and src.project_id is None:
            src.project_id = req.project_id
    else:
        copy = CaseFile(
            case_id=requester.id,
            title=src.title,
            status="received",
            doc_number=src.doc_number,
            agency=src.agency or case.title,
            deadline=src.deadline,
            project_id=req.project_id,
            filename=src.filename,
            content_type=src.content_type,
            size=src.size,
            category=src.category,
            data=src.data,
            uploaded_by=me.id,
        )
        session.add(copy)
        await session.flush()
        delivered_id = copy.id
    req.status = "fulfilled"
    req.file_id = delivered_id
    req.resolved_by = me.id
    req.resolved_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(case)

    to = await notify.case_emails(session, requester.id, exclude={me.id})
    if to:
        subject, body = notify.document_request_resolved(requester, case, req, me)
        background.add_task(mailer.send, to, subject, body)
    else:
        log.info("document_request_resolved %s — ไม่ส่งแจ้งเตือน: สมาชิกของ %s ไม่มีอีเมล", req.title, requester.title)
    return case_out(case)


@router.post("/{case_id}/requests/{request_id}/decline", response_model=CaseOut)
async def decline_request(
    case_id: str,
    request_id: str,
    payload: DocumentRequestDecline,
    background: BackgroundTasks,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    case = await _get_managed_case(session, case_id, me)
    req = _request_in(case, request_id, incoming=True)
    if req.status != "pending":
        raise HTTPException(409, f"This request is already {req.status}")
    req.status = "declined"
    req.reply = payload.reply.strip() or None
    req.resolved_by = me.id
    req.resolved_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(case)

    requester = await session.get(Case, req.from_case_id)
    to = await notify.case_emails(session, req.from_case_id, exclude={me.id}) if requester else []
    if to and requester:
        subject, body = notify.document_request_resolved(requester, case, req, me)
        background.add_task(mailer.send, to, subject, body)
    return case_out(case)


@router.delete("/{case_id}/requests/{request_id}", response_model=CaseOut)
async def cancel_request(
    case_id: str,
    request_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """ผู้ขอถอนคำขอ — คนที่ยื่นเอง หรือเจ้าของ/admin ของที่เก็บผู้ขอ ถอนได้เฉพาะที่ยังค้าง

    คำขอที่จบแล้วเก็บไว้เป็นประวัติ ลบไม่ได้
    """
    case = await _get_case(session, case_id, me)
    req = _request_in(case, request_id, incoming=False)
    if req.requested_by != me.id and not case.can_manage(me.id):
        raise HTTPException(403, "Only the requester, the owner or an admin can cancel this request")
    if req.status != "pending":
        raise HTTPException(409, f"This request is already {req.status}")
    await session.delete(req)
    await session.commit()
    await session.refresh(case)
    return case_out(case)


# ---------- สมาชิกของที่เก็บ (ล้อกับโปรเจค) ----------


@router.post("/{case_id}/members/{member_id}", status_code=204)
async def add_member(
    case_id: str,
    member_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    case = await _get_managed_case(session, case_id, me)
    member = await session.get(Member, member_id)
    if member is None:
        raise HTTPException(404, f"Member {member_id} not found")
    if member.id not in {m.id for m in case.members}:
        case.members.append(member)
        await session.commit()


@router.delete("/{case_id}/members/{member_id}", status_code=204)
async def remove_member(
    case_id: str,
    member_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    case = await _get_managed_case(session, case_id, me)
    if member_id == case.owner_id:
        raise HTTPException(400, "The owner cannot be removed")
    await session.execute(
        delete(case_members).where(
            case_members.c.case_id == case_id, case_members.c.member_id == member_id
        )
    )
    await session.commit()


@router.patch("/{case_id}/members/{member_id}", status_code=204)
async def set_member_role(
    case_id: str,
    member_id: str,
    payload: MemberRoleUpdate,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ตั้ง/ถอด admin — เจ้าของเท่านั้น เหตุผลเดียวกับโปรเจค"""
    case = await _get_owned_case(session, case_id, me)
    if member_id == case.owner_id:
        raise HTTPException(400, "The owner already has every permission")
    if member_id not in {m.id for m in case.members}:
        raise HTTPException(404, "That person is not in this document")
    await session.execute(
        update(case_members)
        .where(case_members.c.case_id == case_id, case_members.c.member_id == member_id)
        .values(role=payload.role)
    )
    await session.commit()
