"""VAPID Web Push 服務"""
import asyncio
import base64
import json
import logging
import os

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding, NoEncryption, PrivateFormat, PublicFormat,
)

logger = logging.getLogger(__name__)

# ── VAPID Key 管理 ────────────────────────────────────────────────────────────

def generate_vapid_keys() -> tuple[str, str]:
    """Generate (private_pem, public_b64url) VAPID key pair."""
    key = ec.generate_private_key(ec.SECP256R1())
    private_pem = key.private_bytes(
        Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()
    ).decode()
    pub_raw = key.public_key().public_bytes(
        Encoding.X962, PublicFormat.UncompressedPoint
    )
    public_b64 = base64.urlsafe_b64encode(pub_raw).rstrip(b'=').decode()
    return private_pem, public_b64


def load_or_generate_keys() -> tuple[str, str]:
    """Load VAPID keys from env vars, or generate and log new ones."""
    private_pem = os.getenv("VAPID_PRIVATE_KEY", "")
    public_b64  = os.getenv("VAPID_PUBLIC_KEY",  "")
    if private_pem and public_b64:
        return private_pem, public_b64

    private_pem, public_b64 = generate_vapid_keys()
    logger.warning(
        "[Push] VAPID keys not set — generated new keys for this session.\n"
        "  Add these to .env to persist subscriptions across restarts:\n"
        "  VAPID_PRIVATE_KEY=%s\n"
        "  VAPID_PUBLIC_KEY=%s",
        private_pem.replace("\n", "\\n"),
        public_b64,
    )
    return private_pem, public_b64


# ── Push 發送（同步，供 run_in_executor 呼叫）────────────────────────────────

def _send_push_sync(
    endpoint: str, p256dh: str, auth_key: str,
    payload: dict, private_pem: str,
) -> None:
    from pywebpush import webpush, WebPushException
    try:
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth_key},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=private_pem,
            vapid_claims={"sub": f"mailto:{os.getenv('VAPID_EMAIL', 'admin@ibms.com')}"},
            timeout=10,
        )
    except WebPushException as exc:
        logger.warning("[Push] send failed (endpoint=%s): %s", endpoint[:40], exc)
    except Exception as exc:
        logger.warning("[Push] unexpected error: %s", exc)


async def send_push_notification(
    endpoint: str, p256dh: str, auth_key: str,
    payload: dict, private_pem: str,
) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None, _send_push_sync, endpoint, p256dh, auth_key, payload, private_pem
    )
