import os
import sys
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import admin


class _FakeDoc:
    def __init__(self, doc_id, data=None, devices=None):
        self.id = doc_id
        self._data = data
        self._devices = devices or {}
        self.exists = data is not None

    def get(self):
        return self

    def to_dict(self):
        return dict(self._data or {})

    def collection(self, name):
        if name != "devices":
            return _FakeCollection({})
        return _FakeCollection(self._devices)


class _FakeQuery:
    def __init__(self, docs):
        self._docs = list(docs)
        self._filters = []
        self._order = None
        self._limit = None

    def where(self, field, op, value):
        self._filters.append((field, op, value))
        return self

    def order_by(self, field, direction=None):
        self._order = (field, direction)
        return self

    def limit(self, value):
        self._limit = value
        return self

    def stream(self):
        docs = self._docs
        for field, op, value in self._filters:
            if op == "==":
                docs = [doc for doc in docs if doc.to_dict().get(field) == value]
            elif op == ">=":
                docs = [doc for doc in docs if doc.to_dict().get(field) and doc.to_dict().get(field) >= value]

        if self._order:
            field, direction = self._order
            reverse = direction == admin.firestore.Query.DESCENDING
            docs = sorted(docs, key=lambda doc: doc.to_dict().get(field) or datetime.min.replace(tzinfo=timezone.utc), reverse=reverse)

        if self._limit is not None:
            docs = docs[: self._limit]
        return docs


class _FakeCollection:
    def __init__(self, docs):
        self._docs = docs

    def document(self, doc_id):
        value = self._docs.get(doc_id)
        if isinstance(value, _FakeDoc):
            return value
        return _FakeDoc(doc_id, value)

    def where(self, field, op, value):
        return _FakeQuery(self._docs.values()).where(field, op, value)

    def stream(self):
        return list(self._docs.values())


class _FakeDb:
    def __init__(self):
        now = datetime.now(timezone.utc)
        self.users = {
            "admin-uid": {
                "email": "edson854_8@hotmail.com",
                "name": "Admin",
                "role": "admin",
            },
            "other-admin-uid": {
                "email": "other-admin@example.com",
                "name": "Other Admin",
                "role": "admin",
            },
            "normal-uid": {
                "email": "normal@example.com",
                "name": "Normal",
                "role": "user",
            },
            "rca-uid": {
                "email": "rca@example.com",
                "name": "RCA Teste",
                "role": "user",
                "license_type": "trial",
                "created_at": now - timedelta(hours=3),
                "updated_at": now - timedelta(hours=2),
                "cpf": "52998224725",
                "telefone": "13999001234",
            },
            "active-old-uid": {
                "email": "ativo-antigo@example.com",
                "name": "RCA Antigo Ativo",
                "role": "user",
                "license_type": "paid",
                "created_at": now - timedelta(days=45),
                "updated_at": now - timedelta(days=2),
                "telefone": "11988887777",
            },
            "stopped-old-uid": {
                "email": "parado-antigo@example.com",
                "name": "RCA Antigo Parado",
                "role": "user",
                "license_type": "trial",
                "created_at": now - timedelta(days=60),
                "updated_at": now - timedelta(days=20),
                "telefone": "11977776666",
            },
            "never-uid": {
                "email": "sem-uso@example.com",
                "name": "RCA Sem Uso",
                "role": "user",
                "license_type": "trial",
                "created_at": now - timedelta(days=10),
                "updated_at": now - timedelta(days=10),
                "telefone": "11966665555",
            },
        }
        self.subscriptions = {
            "rca-uid": {
                "planId": "trial",
                "status": "trialing",
                "trialEndsAt": now + timedelta(days=12),
                "createdAt": now - timedelta(hours=3),
                "updatedAt": now - timedelta(hours=2),
                "userId": "rca-uid",
            },
            "active-old-uid": {
                "planId": "monthly",
                "status": "active",
                "accessEndsAt": now + timedelta(days=20),
                "createdAt": now - timedelta(days=45),
                "updatedAt": now - timedelta(days=2),
                "userId": "active-old-uid",
            },
            "stopped-old-uid": {
                "planId": "trial",
                "status": "trial_expired",
                "trialEndsAt": now - timedelta(days=45),
                "createdAt": now - timedelta(days=60),
                "updatedAt": now - timedelta(days=20),
                "userId": "stopped-old-uid",
            }
        }
        self.devices = {
            "rca-uid": {
                "device-a": _FakeDoc(
                    "device-a",
                    {
                        "lastSeenAt": now - timedelta(hours=1),
                        "firstSeenAt": now - timedelta(hours=3),
                        "loginCount": 2,
                    },
                )
            },
            "active-old-uid": {
                "device-b": _FakeDoc(
                    "device-b",
                    {
                        "lastSeenAt": now - timedelta(days=2),
                        "firstSeenAt": now - timedelta(days=45),
                        "loginCount": 8,
                    },
                )
            },
            "stopped-old-uid": {
                "device-c": _FakeDoc(
                    "device-c",
                    {
                        "lastSeenAt": now - timedelta(days=21),
                        "firstSeenAt": now - timedelta(days=60),
                        "loginCount": 3,
                    },
                )
            }
        }
        self.audit = {
            "event-a": _FakeDoc(
                "event-a",
                {
                    "uid": "rca-uid",
                    "action": "cotatudo_extension_fill_reported",
                    "status": "success",
                    "createdAt": now - timedelta(minutes=20),
                    "metadata": {
                        "jobId": "job-1",
                        "site": "vr-cotacao",
                        "modo": "ean",
                        "prazo": 7,
                        "totalItens": 10,
                        "preenchidos": 6,
                        "precosRecebidos": 6,
                        "naoEncontrados": 4,
                        "debug": {"produto": "nao deve sair"},
                    },
                },
            ),
            "event-stopped": _FakeDoc(
                "event-stopped",
                {
                    "uid": "stopped-old-uid",
                    "action": "cotatudo_extension_fill_reported",
                    "status": "success",
                    "createdAt": now - timedelta(days=21),
                    "metadata": {
                        "jobId": "job-old",
                        "site": "vr-cotacao",
                        "modo": "ean",
                        "prazo": 14,
                        "totalItens": 8,
                        "preenchidos": 8,
                    },
                },
            )
        }

    def collection(self, name):
        if name == "users":
            docs = {
                uid: _FakeDoc(uid, data, self.devices.get(uid))
                for uid, data in self.users.items()
            }
            return _FakeCollection(docs)
        if name == "subscriptions":
            return _FakeCollection({
                uid: _FakeDoc(uid, data)
                for uid, data in self.subscriptions.items()
            })
        if name == "security_audit":
            return _FakeCollection(self.audit)
        return _FakeCollection({})


def _client(monkeypatch, uid="admin-uid"):
    app = FastAPI()
    app.include_router(admin.router, prefix="/api/admin")
    fake_db = _FakeDb()

    admin.clear_admin_report_cache()
    monkeypatch.setenv("ADMIN_ALLOWED_EMAILS", "edson854_8@hotmail.com")
    monkeypatch.setattr(admin, "_fs", lambda: fake_db)
    token_email = fake_db.users.get(uid, {}).get("email")
    monkeypatch.setattr(admin.firebase_auth, "verify_id_token", lambda _token: {"uid": uid, "email": token_email})

    async def _fake_audit_event(*_args, **_kwargs):
        return None

    monkeypatch.setattr(admin, "audit_event", _fake_audit_event)
    return TestClient(app)


def test_admin_recent_users_requires_token():
    app = FastAPI()
    app.include_router(admin.router, prefix="/api/admin")
    client = TestClient(app)

    response = client.get("/api/admin/recent-users")

    assert response.status_code == 401


def test_admin_recent_users_blocks_non_admin(monkeypatch):
    client = _client(monkeypatch, uid="normal-uid")

    response = client.get("/api/admin/recent-users", headers={"Authorization": "Bearer token"})

    assert response.status_code == 403


def test_admin_recent_users_blocks_admin_email_outside_allowlist(monkeypatch):
    client = _client(monkeypatch, uid="other-admin-uid")

    response = client.get("/api/admin/recent-users", headers={"Authorization": "Bearer token"})

    assert response.status_code == 403


def test_admin_recent_users_returns_sanitized_operational_data(monkeypatch):
    client = _client(monkeypatch, uid="admin-uid")

    response = client.get("/api/admin/recent-users", headers={"Authorization": "Bearer token"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["totals"]["recentUsers"] == 1
    assert payload["totals"]["registeredUsers"] == 5
    assert payload["totals"]["usedTool"] == 3
    assert payload["totals"]["activeToday"] == 1
    assert payload["totals"]["activeLast7Days"] == 2
    assert payload["totals"]["stoppedUsing"] == 1
    assert payload["totals"]["oldRegisteredActive"] == 1
    assert payload["totals"]["oldRegisteredStopped"] == 1
    assert payload["totals"]["neverUsed"] == 2

    user = payload["users"][0]
    assert user["uid"] == "rca-uid"
    assert user["email"] == "rca@example.com"
    assert user["phone"] == "13999001234"
    assert user["subscription"]["planId"] == "trial"
    assert user["subscription"]["status"] == "trialing"
    assert user["activity"]["uniqueCotatudoJobs"] == 1
    assert user["activity"]["totalCotatudoJobs"] == 1
    assert user["activity"]["recentCotatudoJobs"][0]["preenchidos"] == 6
    assert payload["segments"]["activeLast7Days"][0]["uid"] == "rca-uid"
    assert payload["segments"]["stoppedUsing"][0]["uid"] == "stopped-old-uid"
    assert payload["segments"]["oldRegisteredActive"][0]["uid"] == "active-old-uid"

    serialized = str(payload).lower()
    assert "cpf" not in serialized
    assert "telefone" not in serialized
    assert "52998224725" not in serialized
    assert "produto" not in serialized


def test_admin_recent_users_reuses_short_cache(monkeypatch):
    client = _client(monkeypatch, uid="admin-uid")
    calls = 0

    def _fake_build_report(_db, *, days, limit, now=None):
        nonlocal calls
        calls += 1
        return {
            "ok": True,
            "generatedAt": "2026-07-01T12:00:00Z",
            "window": {"days": days, "returnedPerSegmentLimit": limit},
            "totals": {
                "registeredUsers": 0,
                "totalRegistered": 0,
                "recentUsers": 0,
                "activeTrials": 0,
                "usedTool": 0,
                "noUsage": 0,
                "activeToday": 0,
                "activeLast7Days": 0,
                "stoppedUsing": 0,
                "oldRegisteredActive": 0,
                "oldRegisteredStopped": 0,
                "neverUsed": 0,
            },
            "segments": {},
            "users": [],
        }

    monkeypatch.setattr(admin, "_build_recent_users_report", _fake_build_report)

    first = client.get("/api/admin/recent-users?days=7&limit=25", headers={"Authorization": "Bearer token"})
    second = client.get("/api/admin/recent-users?days=7&limit=25", headers={"Authorization": "Bearer token"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls == 1
    assert first.json()["cache"]["hit"] is False
    assert second.json()["cache"]["hit"] is True
