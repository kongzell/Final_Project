"""หน้า Documents — "เรื่อง" ที่รวมเอกสารของงานเดียวกัน

สิทธิ์ล้อกับโปรเจค: สมาชิกดู/เพิ่มไฟล์ · เจ้าของหรือ admin แก้ข้อมูลและจัดการคน ·
เจ้าของคนเดียวลบไฟล์ ลบเรื่อง ตั้ง admin — เอกสารราชการไม่ควรลบง่าย

ผูกโปรเจคได้ 1 ต่อ 1 และคนผูกต้องมีสิทธิ์ทั้งสองฝั่ง ไม่งั้นฝ่ายเอกสารจะยิงงานเข้าบอร์ด
ของทีมที่ตัวเองไม่ได้อยู่ได้
"""

from __future__ import annotations

from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_member
from app.db import get_session
from app.models import Case, CaseFile, Member, Project, case_members
from app.schemas import CaseOut, CaseUpdate, MemberRoleUpdate
from app.serialize import case_out

router = APIRouter(prefix="/api/cases", tags=["documents"])

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
    """เรื่องที่ me เป็นสมาชิก — คนนอกได้ 404 เหมือนโปรเจค ไม่ยืนยันว่า id นี้มีจริง"""
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


# ---------- เรื่อง ----------


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


@router.post("", response_model=CaseOut, status_code=201)
async def create_case(
    file: UploadFile = File(...),
    category: str = Form("other"),
    title: str | None = Form(None),
    doc_number: str | None = Form(None),
    agency: str | None = Form(None),
    deadline: str | None = Form(None),
    project_id: str | None = Form(None),
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """อัปโหลดไฟล์แรก = สร้างเรื่องใหม่ — ชื่อเรื่องตั้งต้นจากชื่อไฟล์ถ้าไม่ได้ส่งมา

    รับเป็น form ไม่ใช่ JSON เพราะมีไฟล์แนบมาด้วยในคำขอเดียว
    """
    data, content_type, filename = await _read_upload(file)
    cat = _check_category(category)

    case = Case(
        title=(title or "").strip() or filename.rsplit(".", 1)[0],
        doc_number=(doc_number or "").strip() or None,
        agency=(agency or "").strip() or None,
        owner_id=me.id,
    )
    if deadline:
        try:
            case.deadline = date.fromisoformat(deadline)
        except ValueError:
            raise HTTPException(422, "deadline must be YYYY-MM-DD") from None
    if project_id:
        case.project_id = (await _linkable_project(session, project_id, me)).id

    case.members.append(me)
    case.files.append(
        CaseFile(
            filename=filename,
            content_type=content_type,
            size=len(data),
            category=cat,
            data=data,
            uploaded_by=me.id,
        )
    )
    session.add(case)
    await session.commit()
    await session.refresh(case)
    return case_out(case)


async def _linkable_project(session: AsyncSession, project_id: str, me: Member) -> Project:
    """โปรเจคที่ me ผูกเรื่องได้ — ต้องเป็นเจ้าของ/admin ของโปรเจคนั้น และยังไม่ถูกเรื่องอื่นผูก"""
    project = await session.get(Project, project_id)
    if project is None or me.id not in {m.id for m in project.members}:
        raise HTTPException(404, f"Project {project_id} not found")
    if not project.can_manage(me.id):
        raise HTTPException(403, "You need to be the owner or an admin of that project to link it")
    taken = await session.scalar(select(Case.id).where(Case.project_id == project_id))
    if taken is not None:
        raise HTTPException(409, "That project is already linked to another document")
    return project


@router.patch("/{case_id}", response_model=CaseOut)
async def update_case(
    case_id: str,
    payload: CaseUpdate,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    case = await _get_managed_case(session, case_id, me)
    data = payload.model_dump(exclude_unset=True)

    # ผูก/ถอดโปรเจคต้องผ่านการตรวจสิทธิ์ฝั่งโปรเจคด้วย ไม่ใช่แค่ฝั่งเรื่อง
    if "project_id" in data:
        new_id = data.pop("project_id")
        if new_id is not None and new_id != case.project_id:
            await _linkable_project(session, new_id, me)
        case.project_id = new_id

    for field, value in data.items():
        setattr(case, field, value)

    await session.commit()
    await session.refresh(case)
    return case_out(case)


@router.delete("/{case_id}", status_code=204)
async def delete_case(
    case_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ลบเรื่องพร้อมไฟล์ทั้งหมด — งานที่เคยแตกจากไฟล์พวกนี้ยังอยู่ (source_file_id กลายเป็น null)"""
    case = await _get_owned_case(session, case_id, me)
    await session.delete(case)
    await session.commit()


# ---------- ไฟล์ในเรื่อง ----------


@router.post("/{case_id}/files", response_model=CaseOut, status_code=201)
async def add_file(
    case_id: str,
    file: UploadFile = File(...),
    category: str = Form("other"),
    replaces_id: str | None = Form(None),
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CaseOut:
    """เพิ่มเอกสารที่เกี่ยวข้อง — สมาชิกทุกคนของเรื่องทำได้

    ส่ง replaces_id มาเมื่อเป็นฉบับแก้ไขของไฟล์เดิม จะได้เลขเวอร์ชันถัดไปให้เอง
    """
    case = await _get_case(session, case_id, me)
    data, content_type, filename = await _read_upload(file)
    cat = _check_category(category)

    version = 1
    if replaces_id:
        prev = next((f for f in case.files if f.id == replaces_id), None)
        if prev is None:
            raise HTTPException(404, "The file being replaced is not in this document")
        version = prev.version + 1
        cat = prev.category

    case.files.append(
        CaseFile(
            filename=filename,
            content_type=content_type,
            size=len(data),
            category=cat,
            version=version,
            replaces_id=replaces_id or None,
            data=data,
            uploaded_by=me.id,
        )
    )
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
    """ตัวไฟล์ออกทางนี้ทางเดียว — inline ให้เบราว์เซอร์เปิด PDF ได้เลย"""
    case = await _get_case(session, case_id, me)
    f = next((x for x in case.files if x.id == file_id), None)
    if f is None:
        raise HTTPException(404, "File not found")

    # ชื่อไฟล์ไทยต้องส่งแบบ RFC 5987 ไม่งั้นเบราว์เซอร์ได้ชื่อเพี้ยน
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
    """เจ้าของเรื่องเท่านั้น และห้ามลบไฟล์สุดท้าย — เรื่องที่ไม่มีเอกสารเลยไม่มีความหมาย"""
    case = await _get_owned_case(session, case_id, me)
    f = next((x for x in case.files if x.id == file_id), None)
    if f is None:
        raise HTTPException(404, "File not found")
    if len(case.files) == 1:
        raise HTTPException(400, "A document needs at least one file — delete the whole document instead")
    await session.delete(f)
    await session.commit()


# ---------- สมาชิกของเรื่อง (ล้อกับโปรเจค) ----------


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
