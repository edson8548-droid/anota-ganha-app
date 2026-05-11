import os
import sys

import firebase_admin

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.security_audit import _clean_value, audit_event_sync, hash_identifier


def test_hash_identifier_is_stable_and_does_not_expose_raw_value(monkeypatch):
    monkeypatch.setenv("AUDIT_HASH_SALT", "test-salt")

    hashed = hash_identifier("5511999999999")

    assert hashed == hash_identifier("5511999999999")
    assert "5511999999999" not in hashed
    assert len(hashed) == 24


def test_clean_value_redacts_sensitive_keys():
    cleaned = _clean_value(
        {
            "token": "abc",
            "Authorization": "Bearer abc",
            "cpf": "12345678900",
            "safe": "ok",
        }
    )

    assert cleaned["token"] == "[redacted]"
    assert cleaned["Authorization"] == "[redacted]"
    assert cleaned["cpf"] == "[redacted]"
    assert cleaned["safe"] == "ok"


def test_audit_event_sync_does_not_fail_without_firebase(monkeypatch):
    monkeypatch.setattr(firebase_admin, "_apps", {}, raising=False)

    audit_event_sync("test_event", uid="user-1", status="success", metadata={"ok": True})
