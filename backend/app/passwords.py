"""แฮชรหัสผ่านด้วย scrypt จาก stdlib — ไม่ต้องลง bcrypt/passlib เพิ่ม

รูปแบบที่เก็บ: "scrypt$<salt hex>$<hash hex>"  พารามิเตอร์ตาม OWASP (n=2^14, r=8, p=1)
เก็บ salt ไว้ในสตริงเดียวกัน ทำให้เปลี่ยนพารามิเตอร์ในอนาคตได้โดยยังตรวจของเก่าได้
"""

import hashlib
import hmac
import secrets

_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    """เทียบแบบ constant-time — ผิดรูปแบบหรือไม่มีรหัส (บัญชี GitHub) คืน False เฉย ๆ"""
    if not stored:
        return False
    try:
        scheme, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex), n=_N, r=_R, p=_P, dklen=32
        )
        return hmac.compare_digest(digest, bytes.fromhex(hash_hex))
    except (ValueError, TypeError):
        return False
