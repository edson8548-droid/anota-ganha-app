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
        }
        self.subscriptions = {
            "rca-uid": {
                "planId": "trial",
                "status": "trialing",
                "trialEndsAt": now + timedelta(days=12),
                "createdAt": now - timedelta(hours=3),
                "updatedAt": now - timedelta(hours=2),
                "userId": "rca-uid",
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
    assert payload["totals"]["registeredUsers"] == 2
    assert payload["totals"]["usedTool"] == 1
    assert "allRegistered" in payload["segments"]
    assert "activeLast7Days" in payload["segments"]
    assert len(payload["segments"]["allRegistered"]) == 2

    user = payload["users"][0]
    assert user["uid"] == "rca-uid"
    assert user["email"] == "rca@example.com"
    assert user["phone"] == "13999001234"
    assert user["subscription"]["planId"] == "trial"
    assert user["subscription"]["status"] == "trialing"
    assert user["activity"]["uniqueCotatudoJobs"] == 1
    assert user["activity"]["recentCotatudoJobs"][0]["preenchidos"] == 6
    assert user["activity"]["recentEvents"][0]["label"] == "Cotatudo preenchido"
    assert "6/10 preenchidos" in user["activity"]["recentEvents"][0]["detail"]
    assert user["activity"]["recentToolEvents"][0]["label"] == "Cotatudo preenchido"

    serialized = str(payload).lower()
    assert "cpf" not in serialized
    assert "telefone" not in serialized
    assert "52998224725" not in serialized
    assert "produto" not in serialized


def test_admin_report_flags_possible_duplicate_trial_signup_without_exposing_private_ids():
    now = datetime(2026, 7, 1, 12, tzinfo=timezone.utc)
    db = _FakeDb()
    db.users.update({
        "luciano-uid": {
            "email": "lucianocabreracarvalho@gmail.com",
            "name": "Luciano",
            "role": "user",
            "created_at": datetime(2026, 6, 15, 13, 3, tzinfo=timezone.utc),
            "telefone": "13981228883",
            "cpf": "11122233344",
        },
        "lorenzo-uid": {
            "email": "lojadocabrera@gmail.com",
            "name": "Lorenzo Goes Carvalho",
            "role": "user",
            "created_at": datetime(2026, 6, 30, 21, 48, tzinfo=timezone.utc),
            "telefone": "13998014483",
            "cpf": "55566677788",
        },
    })
    db.subscriptions.update({
        "luciano-uid": {
            "planId": "trial",
            "status": "trialing",
            "trialEndsAt": datetime(2026, 6, 30, 13, 3, tzinfo=timezone.utc),
            "createdAt": datetime(2026, 6, 15, 13, 3, tzinfo=timezone.utc),
        },
        "lorenzo-uid": {
            "planId": "trial",
            "status": "trialing",
            "trialEndsAt": datetime(2026, 7, 15, 21, 48, tzinfo=timezone.utc),
            "createdAt": datetime(2026, 6, 30, 21, 48, tzinfo=timezone.utc),
        },
    })

    report = admin._build_recent_users_report(db, days=4, limit=25, now=now)

    suspicious = report["segments"]["suspiciousUsers"]
    suspicious_uids = {user["uid"] for user in suspicious}
    assert {"luciano-uid", "lorenzo-uid"}.issubset(suspicious_uids)
    assert report["totals"]["suspiciousUsers"] == 2

    lorenzo = next(user for user in suspicious if user["uid"] == "lorenzo-uid")
    assert lorenzo["risk"]["suspicious"] is True
    assert "Novo cadastro perto do fim do trial de outro RCA" in lorenzo["risk"]["reasons"]
    assert any(related["email"] == "lucianocabreracarvalho@gmail.com" for related in lorenzo["risk"]["relatedUsers"])

    serialized = str(report).lower()
    assert "11122233344" not in serialized
    assert "55566677788" not in serialized
    assert "cpf" not in serialized
    assert "device-a" not in serialized


def test_admin_merge_cotacao_ready_activity_marks_user_as_used_tool():
    now = datetime.now(timezone.utc)
    report = {
        "totals": {"recentUsers": 1, "activeTrials": 1, "usedTool": 0, "noUsage": 1},
        "users": [
            {
                "uid": "rca-uid",
                "subscription": {"status": "trialing"},
                "activity": {
                    "auditEventCount": 0,
                    "uniqueCotatudoJobs": 0,
                    "cotacaoReadyCount": 0,
                    "recentCotacaoReadyJobs": [],
                    "hasToolUsage": False,
                },
            }
        ],
    }

    admin._merge_cotacao_activity(
        report,
        {
            "rca-uid": {
                "cotacaoReadyCount": 1,
                "lastCotacaoReadyAt": now.isoformat().replace("+00:00", "Z"),
                "recentCotacaoReadyJobs": [
                    {
                        "createdAt": now.isoformat().replace("+00:00", "Z"),
                        "sessionId": "session-1",
                        "totalItens": 10,
                        "preenchidos": 8,
                        "semMatch": 2,
                    }
                ],
            }
        },
    )

    activity = report["users"][0]["activity"]
    assert activity["hasToolUsage"] is True
    assert activity["cotacaoReadyCount"] == 1
    assert report["totals"]["usedTool"] == 1
    assert report["totals"]["noUsage"] == 0


def test_admin_totals_do_not_count_expired_trial_as_active():
    now = datetime.now(timezone.utc)
    users = [
        {
            "subscription": {
                "status": "trialing",
                "trialEndsAt": (now - timedelta(days=1)).isoformat().replace("+00:00", "Z"),
            },
            "activity": {"hasToolUsage": False},
        },
        {
            "subscription": {
                "status": "trialing",
                "trialEndsAt": (now + timedelta(days=1)).isoformat().replace("+00:00", "Z"),
            },
            "activity": {"hasToolUsage": True},
        },
    ]

    assert admin._recompute_totals(users) == {
        "recentUsers": 2,
        "activeTrials": 1,
        "usedTool": 1,
        "noUsage": 1,
        "needsContact": 0,
        "stoppedAfterUse": 0,
        "suspiciousUsers": 0,
    }


def test_admin_device_session_alone_is_not_tool_usage():
    now = datetime.now(timezone.utc)
    db = _FakeDb()
    db.audit = {
        "event-device": _FakeDoc(
            "event-device",
            {
                "uid": "rca-uid",
                "action": "device_session_registered",
                "status": "success",
                "createdAt": now - timedelta(minutes=5),
                "metadata": {"newDevice": False},
            },
        )
    }

    report = admin._build_recent_users_report(db, days=4, limit=25, now=now)
    user = report["users"][0]

    assert user["activity"]["lastSeenAt"] is not None
    assert user["activity"]["auditEventCount"] == 1
    assert user["activity"]["toolEventCount"] == 0
    assert user["activity"]["hasToolUsage"] is False
    assert user["activity"]["recentEvents"][0]["label"] == "Sessão registrada"
    assert user["activity"]["recentEvents"][0]["detail"] == "Dispositivo já registrado"
    assert user["followUp"]["status"] == "never_used"
    assert user["followUp"]["shouldContact"] is True
    assert report["totals"]["usedTool"] == 0
    assert report["totals"]["recentUsers"] == 1
    assert report["totals"]["registeredUsers"] == 2
    assert report["totals"]["noUsage"] == 2
    assert report["totals"]["needsContact"] == 2
    assert "deviceHash" not in str(report)


def test_admin_follow_up_marks_users_who_stopped_after_using_tool():
    now = datetime.now(timezone.utc)
    user = {
        "subscription": {
            "status": "trialing",
            "trialEndsAt": (now + timedelta(days=5)).isoformat().replace("+00:00", "Z"),
        },
        "activity": {
            "hasToolUsage": True,
            "lastToolUseAt": (now - timedelta(days=4, hours=2)).isoformat().replace("+00:00", "Z"),
        },
    }

    follow_up = admin._follow_up_status(user, now)

    assert follow_up["status"] == "stopped"
    assert follow_up["shouldContact"] is True
    assert follow_up["daysSinceToolUse"] == 4
    assert follow_up["label"] == "Parou há 4d"
