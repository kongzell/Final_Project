"""เรียก Gemini ให้แตกงานใหญ่เป็นงานย่อย พร้อมจัดหมวดหมู่ / tag / ประเมินเวลา

เรียกผ่าน REST ตรง ๆ ไม่ผ่าน SDK เพื่อไม่ต้องตามเวอร์ชัน SDK
และใช้ structured output (responseSchema) เพื่อให้ได้ JSON ที่ parse ได้แน่นอน
ไม่ต้องมานั่งแกะ markdown code fence
"""

import json
import logging

import httpx
from fastapi import HTTPException

from app.config import get_settings
from app.schemas import BreakdownResult, SubtaskSuggestion

log = logging.getLogger("ai")

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

CATEGORIES = ["Frontend", "Backend", "Database", "Design", "DevOps", "Testing", "Other"]
COMPLEXITIES = ["low", "medium", "high"]

# บังคับรูปแบบผลลัพธ์ ไม่ให้โมเดลตอบเป็นข้อความอิสระ
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "style": {"type": "string", "enum": ["vertical", "layered"]},
        "styleReason": {"type": "string"},
        "subtasks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "category": {"type": "string", "enum": CATEGORIES},
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "estimateHours": {"type": "number"},
                    "complexity": {"type": "string", "enum": COMPLEXITIES},
                    "reason": {"type": "string"},
                    "dependsOn": {"type": "array", "items": {"type": "integer"}},
                },
                "required": [
                    "title", "description", "category", "tags", "estimateHours", "complexity",
                ],
            },
        },
    },
    "required": ["summary", "subtasks", "style"],
}

PROMPT = """You are a tech lead breaking work down for a software team.

The request: "{title}"
{context}

Break it into subtasks that can actually be picked up and checked off:

1. {slice_rule}
2. Answer in the SAME LANGUAGE as the request above — Thai request, Thai answer;
   English request, English answer. This applies to summary, title, description and reason.
   Keep technical terms in English either way: library names, endpoints, table and field
   names, HTTP verbs. Write "เขียน endpoint POST /api/carts", never a translated path
2b. description is 2-4 sentences: what has to be built, and what counts as done.
   Be concrete — name the fields, endpoints, states or edge cases involved.
   Do not repeat the title, and do not restate the complexity reason
3. category must be one of: {categories} — these stay in English, they are fixed values
4. tags are the skills/tools/languages the subtask actually needs, e.g. React, TypeScript,
   PostgreSQL, REST API — give 1-4, always in English, never vague words like "coding".
   If the extra context names a language, framework, database or service, use exactly
   those in tags, titles and descriptions — never swap in an alternative you prefer.
   If it says something already exists (auth, a table, an endpoint), do not create it again
5. estimateHours is what a mid-level developer would realistically spend (0.5-16)
6. complexity: low = straightforward, medium = needs some design thinking,
   high = risky, unfamiliar, or touching many parts
7. reason explains in one line why you rated the complexity that way
8. Aim for about {count} subtasks, but adjust to fit the work (at least 3).
   Do not pad a small job; split a large one further. Order them the way they should be done.
9. dependsOn lists the positions (0-based index in this list) of the subtasks that MUST be
   finished before this one can start. Only reference positions BEFORE this one.
   {depends_rule}

10. style is the way you actually split the work: "vertical" or "layered".
    styleReason is one line, in the same language as the request, on why that way fits
    THIS request — write it even when the way was given to you

summary is one sentence saying what the whole request is."""

# ---------- กฎข้อ 1 กับข้อ 9 มีสองแบบ AI เลือกเองว่าจะใช้แบบไหนกับคำขอนี้ ----------

#: ตัดตามฟีเจอร์ แต่ละใบใช้ได้จริงในตัวเอง (agile / user story)
VERTICAL_SLICE = """Slice the work VERTICALLY, not by technical layer. Each subtask should be one thin
   end-to-end capability a user or caller can actually exercise when it is done — it may
   touch the database, the API and the UI all at once, and that is fine.
   Good: "Log in with email and password", "Show an error when the password is wrong",
   "Stay logged in after a refresh".
   Bad (layer slicing): "Design the users table", "Write the login API", "Build the login form"
   — those three only become useful together, so nobody can finish or test one on its own.
   Split by layer ONLY when the work genuinely has no user-facing slice, such as setting up
   CI, a one-off data migration, or upgrading a library. Never split something broad
   like "do the frontend\""""

#: ตัดตามชั้นเทคโนโลยี ทำเรียงจากล่างขึ้นบน (waterfall)
LAYERED_SLICE = """Slice the work BY TECHNICAL LAYER, from the bottom up: data model first, then the
   API or business logic, then the user interface, then tests. Each subtask lives in one
   layer only and its title should say which, e.g. "Design the users table",
   "Write the login API", "Build the login form", "Write integration tests for login".
   Every subtask must still be something you can tell is finished — never something
   broad like "do the frontend\""""

#: กฎข้อ 9 ท่อนท้ายสำหรับแบบฟีเจอร์ — ควรว่างเป็นส่วนใหญ่
VERTICAL_DEPENDS = """Keep it minimal and real: a subtask depends on another only when starting it early
   would be wasted work, not merely because it feels later in the plan.
   Slices that touch different features, screens or endpoints are independent — leave
   dependsOn empty so the team can work on them in parallel.
   Aim for most subtasks to have an empty dependsOn; a chain where every task waits for
   the previous one means the work was sliced by layer, so go back and slice it vertically"""

#: กฎข้อ 9 ท่อนท้ายสำหรับแบบชั้น — ลูกโซ่เป็นเรื่องปกติ
LAYERED_DEPENDS = """Layers build on each other, so a chain is expected here: the API depends on the
   data model, the UI depends on the API, tests depend on what they test. Point each
   subtask at the layer directly beneath it that it actually calls or reads from.
   Subtasks in the same layer that do not share code are independent — leave those empty"""

# ให้เกณฑ์ตัดสินก่อน แล้วแนบกฎของทั้งสองแบบให้เลือกใช้
# ผู้ใช้บังคับได้ด้วยการเขียนใน context (ไม่มีปุ่มเลือกบนหน้าเว็บ ลดของให้กด)
# ลังเลให้เอนไปทาง vertical เพราะทีมทำขนานกันได้มากกว่า
SLICE_RULE = (
    """Decide which way to split fits THIS request, then use that way for every subtask
   and report it in `style`:
   - If the extra context from the user asks for a particular way — "by feature",
     "by layer", "agile", "waterfall", "in build order", or words to that effect, in any
     language — follow it. The user knows their team; do not second-guess them
   - Otherwise choose "vertical" (by feature) when the request is a product, module or
     feature set that users can exercise piece by piece — most requests are like this
   - Choose "layered" (by technical layer) when the request is ONE capability whose
     layers genuinely have to be built in order (a single endpoint end to end, a schema
     change, CI or infrastructure setup)
   When unsure, choose "vertical" — it lets more people work at the same time.

   If you chose vertical: """
    + VERTICAL_SLICE
    + """

   If you chose layered: """
    + LAYERED_SLICE
)

DEPENDS_RULE = (
    """Follow the guidance that matches the style you chose.
   If vertical: """
    + VERTICAL_DEPENDS
    + """
   If layered: """
    + LAYERED_DEPENDS
)

MOCK = BreakdownResult(
    summary="[sample] Shopping cart, storefront and back office",
    mock=True,
    style="vertical",
    style_reason="[sample] Several separate capabilities, so each can be shipped on its own",
    subtasks=[
        SubtaskSuggestion(
            title="Add a product to the cart and see it there",
            description=(
                "One cart row per user, one cart_items row per product, the POST that "
                "fills them, and the Add to Cart button that calls it.\n"
                "Keep unit price on cart_items so old carts do not change when a product "
                "is repriced.\n"
                "Done when clicking the button on a product page shows that product in "
                "the cart after a refresh."
            ),
            category="Backend", tags=["FastAPI", "PostgreSQL", "React"],
            estimate_hours=6, complexity="medium",
            reason="First slice has to settle the cart tables the later slices build on",
            depends_on=[],
        ),
        SubtaskSuggestion(
            title="Change the quantity of an item already in the cart",
            description=(
                "Adding a product that is already in the cart raises its quantity instead "
                "of creating a second row, and the quantity box in the cart updates it.\n"
                "Reject quantities above the stock on hand with a 400 and show that "
                "message next to the item.\n"
                "Done when the cart never shows the same product twice."
            ),
            category="Backend", tags=["FastAPI", "React", "REST API"],
            estimate_hours=4, complexity="medium",
            reason="Duplicate handling and the stock check both live in this one path",
            depends_on=[0],
        ),
        SubtaskSuggestion(
            title="Confirm an order and have stock go down",
            description=(
                "Confirm button that deducts every item in the cart from stock inside one "
                "transaction, then empties the cart.\n"
                "If any item is short, roll the whole order back and say which one.\n"
                "Done when two people confirming the last item at the same time leaves "
                "stock at zero, never negative."
            ),
            category="Backend", tags=["FastAPI", "Transaction"],
            estimate_hours=5, complexity="high",
            reason="Must not let stock go negative under concurrent orders",
            depends_on=[0],
        ),
        SubtaskSuggestion(
            title="Search products by name on the storefront",
            description=(
                "Search box on the product list that filters by name, with the query kept "
                "in the URL so a search can be shared.\n"
                "Show an empty state when nothing matches.\n"
                "Done when a search survives a refresh."
            ),
            category="Frontend", tags=["React", "TypeScript"],
            estimate_hours=3, complexity="low",
            reason="Self-contained screen work that touches nothing the cart owns",
            depends_on=[],
        ),
    ],
)


def _explain(status: int, body: str) -> str:
    """แปลง error ของ Gemini เป็นข้อความที่คนอ่านรู้เรื่อง

    ของเดิมโยน JSON ดิบขึ้นหน้าเว็บทั้งก้อน ซึ่งยาว อ่านไม่ออก และมักถูกตัดกลางประโยค
    ผู้ใช้ต้องรู้แค่ว่า "เกิดอะไร" กับ "ทำยังไงต่อ"
    """
    if status == 429:
        return "โควตา Gemini หมดแล้ว"
    if status == 503:
        return "ตอนนี้ Gemini มีคนใช้เยอะ ลองกดใหม่อีกครั้งใน 1-2 นาที"
    if status in (401, 403):
        return "GEMINI_API_KEY ใช้ไม่ได้หรือหมดอายุ — ขอ key ใหม่ที่ https://aistudio.google.com/apikey"
    if status == 400:
        return f"Gemini ไม่รับคำขอนี้ (400) — {_first_message(body)}"
    return f"Gemini ตอบกลับ {status} — {_first_message(body)}"


def _first_message(body: str) -> str:
    """ดึงเฉพาะบรรทัด message จาก JSON ที่ Gemini ส่งมา ไม่เอาทั้งก้อน"""
    try:
        text = json.loads(body).get("error", {}).get("message", "")
    except (ValueError, AttributeError):
        text = body
    text = " ".join(text.split())
    return text[:160] if text else "ไม่มีรายละเอียดเพิ่มเติม"


async def breakdown(title: str, context: str = "", count: int = 5) -> BreakdownResult:
    settings = get_settings()

    if settings.ai_mock and not settings.gemini_api_key:
        return MOCK.model_copy(update={"summary": f"[sample] {title}"})

    if not settings.gemini_api_key:
        raise HTTPException(
            503,
            "GEMINI_API_KEY is not set — get a key at https://aistudio.google.com/apikey "
            "and put it in .env (or set AI_MOCK=true to try the UI with sample data first)",
        )

    prompt = PROMPT.format(
        title=title,
        context=f"Extra context from the user: {context}" if context.strip() else "",
        categories=", ".join(CATEGORIES),
        count=count,
        slice_rule=SLICE_RULE,
        depends_rule=DEPENDS_RULE,
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
            "temperature": 0.4,
        },
    }

    url = ENDPOINT.format(model=settings.gemini_model)
    try:
        # โมเดลรุ่นใหม่ใช้เวลาคิดนานกว่าเดิม เผื่อเวลาไว้เยอะหน่อย
        async with httpx.AsyncClient(timeout=180) as client:
            res = await client.post(
                url, json=payload, headers={"x-goog-api-key": settings.gemini_api_key}
            )
    except httpx.HTTPError as exc:
        # ข้อความของ timeout เป็นสตริงว่าง ต้องเอาชื่อคลาสมาบอกด้วยถึงจะรู้เรื่อง
        raise HTTPException(502, f"Could not reach Gemini ({type(exc).__name__}): {exc}") from exc

    if res.status_code != 200:
        # เก็บรหัสจริงไว้ใน log ด้วย เพราะข้อความบนหน้าเว็บถูกย่อจนแยกไม่ออกทีหลังว่า
        # โควตาหมด (429) หรือฝั่ง Google แน่น (503) — API key อยู่ใน header ไม่ใช่ body จึง log ได้
        log.warning("Gemini ตอบ %s (breakdown): %s", res.status_code, res.text[:200])
        raise HTTPException(502, _explain(res.status_code, res.text))

    try:
        text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(text)
    except (KeyError, IndexError, ValueError) as exc:
        raise HTTPException(502, f"Could not read the Gemini response: {exc}") from exc

    return BreakdownResult.model_validate({**data, "mock": False})


# ---------- จับคู่ commit กับการ์ด ----------
#
# ใช้ตอนที่ commit ไม่ได้เขียนรหัสงานมา (ซึ่งเกิดบ่อยกว่าที่คิด)
# ผลลัพธ์เป็นแค่ "ข้อเสนอ" ไม่ย้ายการ์ดเอง เพราะเดาผิดแล้วงานของคนอื่นขยับ
# จะสร้างความสับสนมากกว่าประโยชน์ที่ได้

#: 0 = ไม่ตรงกับงานไหนเลย — ใช้แทน null เพราะ responseSchema ไม่รองรับ nullable
MATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "number": {"type": "integer"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "reason": {"type": "string"},
    },
    "required": ["number", "confidence", "reason"],
}

MATCH_PROMPT = """You are a tech lead deciding which card on the board a new commit belongs to.

Commit message: "{message}"

Unfinished tasks in this project:
{tasks}

Say which task this commit most likely refers to:

1. number = the task number that fits best. Answer 0 if none of them fit
2. Never guess — if the commit message is too broad, e.g. "fix bug", "update", "wip",
   or has nothing to do with any task, answer 0
3. confidence:
   high   = the message clearly talks about the same thing as the task title
   medium = related, but not word for word
   low    = plausible, but you are not sure
4. reason explains your choice in one line (or why nothing matched). Answer in English."""


async def match_commit(message: str, tasks: list[dict]) -> dict | None:
    """เดาว่า commit ตรงกับงานใบไหน — คืน None เมื่อไม่มั่นใจหรือเรียกไม่สำเร็จ

    tasks: [{"number": 3, "title": "...", "category": "Backend"}, ...]

    ตั้งใจไม่ให้ error ออกไปข้างนอก เพราะฟังก์ชันนี้ถูกเรียกหลังตอบ webhook ไปแล้ว
    ถ้า Gemini ล่มก็แค่ไม่มีข้อเสนอ ไม่ควรทำให้อะไรพัง
    """
    settings = get_settings()
    if not settings.gemini_api_key or not tasks:
        return None

    listing = "\n".join(
        f"- number {t['number']}: {t['title']}"
        + (f"  [{t['category']}]" if t.get("category") else "")
        for t in tasks
    )
    payload = {
        "contents": [{"parts": [{"text": MATCH_PROMPT.format(message=message, tasks=listing)}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": MATCH_SCHEMA,
            # งานนี้ต้องการความแม่น ไม่ต้องการความสร้างสรรค์
            "temperature": 0.1,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post(
                ENDPOINT.format(model=settings.gemini_model),
                json=payload,
                headers={"x-goog-api-key": settings.gemini_api_key},
            )
        if res.status_code != 200:
            # ทำงานอยู่เบื้องหลัง ไม่มีใครเห็น error — ไม่ log ไว้จะไม่รู้เลยว่าเงียบเพราะอะไร
            log.warning("Gemini ตอบ %s (match_commit): %s", res.status_code, res.text[:200])
            return None
        data = json.loads(res.json()["candidates"][0]["content"]["parts"][0]["text"])
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None

    number = data.get("number") or 0
    if number <= 0 or not any(t["number"] == number for t in tasks):
        return None
    return {
        "number": number,
        "confidence": data.get("confidence") or "low",
        "reason": (data.get("reason") or "")[:300],
    }
