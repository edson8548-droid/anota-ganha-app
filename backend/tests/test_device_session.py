import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.users import DeviceSessionPayload
from services.security_audit import hash_identifier


def test_device_session_payload_accepts_expected_metadata():
    payload = DeviceSessionPayload(
        deviceId="device-12345678901234567890",
        platform="Win32",
        language="pt-BR",
        timezone="America/Sao_Paulo",
        screenWidth=1920,
        screenHeight=1080,
    )

    assert payload.deviceId.startswith("device-")
    assert payload.screenWidth == 1920


def test_device_hash_does_not_expose_device_id():
    device_id = "device-12345678901234567890"
    device_hash = hash_identifier(device_id)

    assert device_hash != device_id
    assert len(device_hash) == 24
