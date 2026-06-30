import asyncio
import logging
import os
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth, firestore

from services.security_audit import AUDIT_COLLECTION, audit_event

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

MAX_LOOKBACK_DAYS = 30
MAX_RECENT_USERS_LIMIT = 50
AUDIT_EVENT_LIMIT = 300
DEFAULT_ADMIN_ALLOWED_EMAILS = {"edson854_8@hotmail.com"}
COTACAO_READY_ACTIONS = {
    "cotacao_ready_confirmed",
    "cotacao_ready_processed",
    "cotacao_ready_preview_completed",
}

_mongo_db = None


def init_admin(database):
    global _mongo_db
    _mongo_db = database


def _fs():
    return firestore.client()


def _admin_allowed_emails() -> set[str]:
    raw = os.environ.get("ADMIN_ALLOWED_EMAILS")
    if raw is None:
        return DEFAULT_ADMIN_ALLOWED_EMAILS
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def _is_allowed_admin_identity(decoded: dict, user_data: dict) -> bool:
    email = str(decoded.get("email") or user_data.get("email") or "").strip().lower()
    return user_data.get("role") == "admin" and email in _admin_allowed_emails()


def _as_utc_datetime(value) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, "timestamp"):
        return datetime.fromtimestamp(value.timestamp(), tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _iso(value) -> str | None:
    dt = _as_utc_datetime(value)
    if not dt:
        return None
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _public_user_data(uid: str, data: dict) -> dict:
    return {
        "uid": uid,
        "email": data.get("email"),
        "name": data.get("name") or data.get("nome") or data.get("displayName"),
        "role": data.get("role"),
        "licenseType": data.get("license_type"),
        "createdAt": _iso(data.get("created_at") or data.get("createdAt")),
        "updatedAt": _iso(data.get("updated_at") or data.get("updatedAt")),
        "referralCode": data.get("referralCode") or data.get("referredByCode"),
        "referredByPartnerName": data.get("referredByPartnerName"),
    }


def _public_subscription_data(data: dict | None) -> dict | None:
    if not data:
        return None
    return {
        "planId": data.get("planId"),
        "status": data.get("status"),
        "trialEndsAt": _iso(data.get("trialEndsAt")),
        "accessEndsAt": _iso(data.get("accessEndsAt")),
        "createdAt": _iso(data.get("createdAt")),
        "updatedAt": _iso(data.get("updatedAt")),
        "paymentMethod": data.get("paymentMethod"),
    }


def _device_activity(user_ref) -> dict:
    devices = list(user_ref.collection("devices").stream())
    last_seen = None
    login_count = 0

    for doc in devices:
        data = doc.to_dict() or {}
        seen_at = _as_utc_datetime(data.get("lastSeenAt"))
        if seen_at and (last_seen is None or seen_at > last_seen):
            last_seen = seen_at
        try:
            login_count += int(data.get("loginCount") or 0)
        except (TypeError, ValueError):
            pass

    return {
        "deviceCount": len(devices),
        "loginCount": login_count,
        "lastSeenAt": _iso(last_seen),
    }


def _event_datetime(event: dict) -> datetime | None:
    return _as_utc_datetime(event.get("createdAt") or event.get("createdAtIso"))


def _compact_job_event(event: dict) -> dict:
    metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
    return {
        "createdAt": _iso(event.get("createdAt") or event.get("createdAtIso")),
        "jobId": metadata.get("jobId"),
        "site": metadata.get("site"),
        "tabelaNome": metadata.get("tabelaNome"),
        "modo": metadata.get("modo"),
        "prazo": metadata.get("prazo"),
        "totalItens": metadata.get("totalItens"),
        "preenchidos": metadata.get("preenchidos"),
        "precosRecebidos": metadata.get("precosRecebidos"),
        "naoEncontrados": metadata.get("naoEncontrados") or metadata.get("nao_encontrados"),
        "falhas": metadata.get("falhas"),
    }


def _compact_cotacao_ready_event(event: dict) -> dict:
    metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
    total = metadata.get("totalItens") or metadata.get("total")
    sem_match = metadata.get("semMatch") or metadata.get("sem_match")
    preenchidos = metadata.get("preenchidos")
    if preenchidos is None and isinstance(total, int) and isinstance(sem_match, int):
        preenchidos = max(total - sem_match, 0)

    return {
        "createdAt": _iso(event.get("createdAt") or event.get("createdAtIso")),
        "source": metadata.get("source") or "cotacao_pronta",
        "sessionId": metadata.get("sessionId"),
        "jobId": metadata.get("jobId"),
        "tabelaId": metadata.get("tabelaId"),
        "prazo": metadata.get("prazo"),
        "modo": metadata.get("modo"),
        "totalItens": total,
        "preenchidos": preenchidos,
        "semMatch": sem_match,
    }


def _cotacao_session_summary(session: dict) -> dict:
    resultados = session.get("resultados") if isinstance(session.get("resultados"), list) else []
    itens = session.get("itens") if isinstance(session.get("itens"), list) else []
    total = len(itens) or len(resultados)
    preenchidos = sum(
        1
        for item in resultados
        if isinstance(item, dict) and item.get("preco") is not None
    )

    return {
        "createdAt": _iso(session.get("created_at") or session.get("createdAt")),
        "source": "cotacao_pronta",
        "sessionId": str(session.get("_id") or ""),
        "tabelaId": str(session.get("tabela_id") or ""),
        "prazo": session.get("prazo"),
        "modo": session.get("modo"),
        "totalItens": total,
        "preenchidos": preenchidos,
        "semMatch": max(total - preenchidos, 0),
    }


def _audit_activity(db, uid: str, since: datetime) -> dict:
    query = db.collection(AUDIT_COLLECTION).where("uid", "==", uid).limit(AUDIT_EVENT_LIMIT)
    events = []

    try:
        docs = query.stream()
    except Exception:
        logger.exception("[ADMIN] Falha ao carregar auditoria uid=%s", uid)
        docs = []

    for doc in docs:
        data = doc.to_dict() or {}
        created_at = _event_datetime(data)
        if created_at and created_at >= since:
            events.append(data)

    events.sort(key=lambda item: _event_datetime(item) or datetime.min.replace(tzinfo=timezone.utc))

    action_counts = Counter(str(event.get("action") or "unknown") for event in events)
    job_ids = {
        (event.get("metadata") or {}).get("jobId")
        for event in events
        if isinstance(event.get("metadata"), dict) and (event.get("metadata") or {}).get("jobId")
    }
    cotacao_ready_ids = set()
    cotacao_ready_summaries = []

    job_summaries = []
    seen_jobs = set()
    for event in reversed(events):
        action = str(event.get("action") or "")
        metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
        job_id = metadata.get("jobId")
        if action != "cotatudo_extension_fill_reported" or not job_id or job_id in seen_jobs:
            continue
        seen_jobs.add(job_id)
        job_summaries.append(_compact_job_event(event))
        if len(job_summaries) >= 6:
            break

    seen_cotacao_ready = set()
    for event in reversed(events):
        action = str(event.get("action") or "")
        if action not in COTACAO_READY_ACTIONS:
            continue
        metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
        key = metadata.get("sessionId") or metadata.get("jobId") or _iso(event.get("createdAt") or event.get("createdAtIso"))
        if not key or key in seen_cotacao_ready:
            continue
        seen_cotacao_ready.add(key)
        cotacao_ready_ids.add(key)
        if len(cotacao_ready_summaries) < 6:
            cotacao_ready_summaries.append(_compact_cotacao_ready_event(event))

    last_event = events[-1] if events else None
    last_metadata = last_event.get("metadata") if isinstance(last_event, dict) and isinstance(last_event.get("metadata"), dict) else {}

    return {
        "auditEventCount": len(events),
        "actions": dict(action_counts),
        "uniqueCotatudoJobs": len(job_ids),
        "cotacaoReadyCount": len(cotacao_ready_ids),
        "firstEventAt": _iso(_event_datetime(events[0])) if events else None,
        "lastEventAt": _iso(_event_datetime(last_event)) if last_event else None,
        "lastAction": last_event.get("action") if last_event else None,
        "lastToolSite": last_metadata.get("site"),
        "lastToolMode": last_metadata.get("modo"),
        "recentCotatudoJobs": job_summaries,
        "recentCotacaoReadyJobs": cotacao_ready_summaries,
    }


def _stream_recent_user_docs(db, since: datetime, limit: int):
    docs_by_id = {}
    for field in ("created_at", "createdAt"):
        try:
            query = (
                db.collection("users")
                .where(field, ">=", since)
                .order_by(field, direction=firestore.Query.DESCENDING)
                .limit(limit)
            )
            for doc in query.stream():
                docs_by_id[doc.id] = doc
        except Exception:
            logger.warning("[ADMIN] Falha ao consultar users por %s", field, exc_info=True)

    return sorted(
        docs_by_id.values(),
        key=lambda doc: _as_utc_datetime((doc.to_dict() or {}).get("created_at") or (doc.to_dict() or {}).get("createdAt")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )[:limit]


def _sort_activity_items(items: list[dict]) -> list[dict]:
    return sorted(
        items,
        key=lambda item: _as_utc_datetime(item.get("createdAt")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )


def _dedupe_activity_items(items: list[dict]) -> list[dict]:
    deduped = []
    seen = set()
    for item in _sort_activity_items(items):
        key = item.get("sessionId") or item.get("jobId") or item.get("createdAt")
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        deduped.append(item)
    return deduped


def _recompute_totals(users: list[dict]) -> dict:
    active_trials = sum(1 for user in users if (user.get("subscription") or {}).get("status") == "trialing")
    used_tool = sum(1 for user in users if (user.get("activity") or {}).get("hasToolUsage"))
    no_usage = len(users) - used_tool
    return {
        "recentUsers": len(users),
        "activeTrials": active_trials,
        "usedTool": used_tool,
        "noUsage": no_usage,
    }


def _merge_cotacao_activity(report: dict, activity_by_uid: dict[str, dict]) -> dict:
    for user in report.get("users", []):
        uid = user.get("uid")
        extra = activity_by_uid.get(uid) or {}
        if not extra:
            continue

        activity = user.setdefault("activity", {})
        existing_ready_jobs = activity.get("recentCotacaoReadyJobs") or []
        extra_ready_jobs = extra.get("recentCotacaoReadyJobs") or []
        merged_ready_jobs = _dedupe_activity_items([*existing_ready_jobs, *extra_ready_jobs])[:6]

        activity["recentCotacaoReadyJobs"] = merged_ready_jobs
        activity["cotacaoReadyCount"] = max(
            int(activity.get("cotacaoReadyCount") or 0),
            int(extra.get("cotacaoReadyCount") or 0),
            len(merged_ready_jobs),
        )
        activity["cotacaoTableUploads"] = int(extra.get("cotacaoTableUploads") or 0)
        activity["cotacaoLearnedMatches"] = int(extra.get("cotacaoLearnedMatches") or 0)

        last_extra_seen = extra.get("lastCotacaoReadyAt")
        if last_extra_seen:
            current_last = _as_utc_datetime(activity.get("lastEventAt"))
            extra_last = _as_utc_datetime(last_extra_seen)
            if extra_last and (current_last is None or extra_last > current_last):
                activity["lastEventAt"] = _iso(extra_last)
                activity["lastAction"] = "cotacao_ready_session"
                activity["lastToolSite"] = "cotacao_pronta"

        activity["hasToolUsage"] = bool(
            activity.get("hasToolUsage")
            or activity.get("cotacaoReadyCount")
            or activity.get("cotacaoTableUploads")
            or activity.get("cotacaoLearnedMatches")
        )

    report["totals"] = _recompute_totals(report.get("users", []))
    return report


async def _mongo_cotacao_activity_for_users(database, uids: list[str], since: datetime) -> dict[str, dict]:
    if database is None or not uids:
        return {}

    activity_by_uid = {
        uid: {
            "cotacaoReadyCount": 0,
            "cotacaoTableUploads": 0,
            "cotacaoLearnedMatches": 0,
            "recentCotacaoReadyJobs": [],
            "lastCotacaoReadyAt": None,
        }
        for uid in uids
    }

    try:
        sessions = await (
            database.cotacao_sessoes.find(
                {"user_id": {"$in": uids}, "created_at": {"$gte": since}},
                {"_id": 1, "user_id": 1, "created_at": 1, "tabela_id": 1, "prazo": 1, "modo": 1, "itens": 1, "resultados": 1},
            )
            .sort("created_at", -1)
            .limit(MAX_RECENT_USERS_LIMIT * 10)
            .to_list(length=MAX_RECENT_USERS_LIMIT * 10)
        )

        for session in sessions:
            uid = session.get("user_id")
            if uid not in activity_by_uid:
                continue
            summary = _cotacao_session_summary(session)
            bucket = activity_by_uid[uid]
            bucket["cotacaoReadyCount"] += 1
            if len(bucket["recentCotacaoReadyJobs"]) < 6:
                bucket["recentCotacaoReadyJobs"].append(summary)
            session_dt = _as_utc_datetime(session.get("created_at"))
            current_last = _as_utc_datetime(bucket.get("lastCotacaoReadyAt"))
            if session_dt and (current_last is None or session_dt > current_last):
                bucket["lastCotacaoReadyAt"] = _iso(session_dt)

        tables = await (
            database.tabelas_mestre.find(
                {"user_id": {"$in": uids}, "data_upload": {"$gte": since}},
                {"user_id": 1},
            )
            .limit(MAX_RECENT_USERS_LIMIT * 20)
            .to_list(length=MAX_RECENT_USERS_LIMIT * 20)
        )
        for table in tables:
            uid = table.get("user_id")
            if uid in activity_by_uid:
                activity_by_uid[uid]["cotacaoTableUploads"] += 1

        learned = await (
            database.cotacao_aprendizado.find(
                {"user_id": {"$in": uids}, "updated_at": {"$gte": since}},
                {"user_id": 1},
            )
            .limit(MAX_RECENT_USERS_LIMIT * 100)
            .to_list(length=MAX_RECENT_USERS_LIMIT * 100)
        )
        for item in learned:
            uid = item.get("user_id")
            if uid in activity_by_uid:
                activity_by_uid[uid]["cotacaoLearnedMatches"] += 1
    except Exception:
        logger.exception("[ADMIN] Falha ao carregar atividade de cotacao no Mongo")
        return {}

    return {
        uid: data
        for uid, data in activity_by_uid.items()
        if data["cotacaoReadyCount"] or data["cotacaoTableUploads"] or data["cotacaoLearnedMatches"]
    }


def _build_recent_users_report(db, *, days: int, limit: int, now: datetime | None = None) -> dict:
    current = now or datetime.now(timezone.utc)
    since = current - timedelta(days=days)
    user_docs = _stream_recent_user_docs(db, since, limit)
    users = []

    for doc in user_docs:
        uid = doc.id
        data = doc.to_dict() or {}
        if data.get("role") == "admin":
            continue

        user_ref = db.collection("users").document(uid)
        sub_doc = db.collection("subscriptions").document(uid).get()
        subscription = sub_doc.to_dict() if getattr(sub_doc, "exists", False) else None

        device_activity = _device_activity(user_ref)
        audit_activity = _audit_activity(db, uid, since)
        has_tool_usage = bool(
            device_activity["lastSeenAt"]
            or audit_activity["auditEventCount"]
            or audit_activity["uniqueCotatudoJobs"]
        )

        users.append({
            **_public_user_data(uid, data),
            "subscription": _public_subscription_data(subscription),
            "activity": {
                **device_activity,
                **audit_activity,
                "hasToolUsage": has_tool_usage,
            },
        })

    return {
        "ok": True,
        "generatedAt": _iso(current),
        "window": {
            "days": days,
            "since": _iso(since),
            "until": _iso(current),
        },
        "totals": _recompute_totals(users),
        "users": users,
    }


async def _require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials:
        logger.warning("[SECURITY] auth_missing route=admin")
        raise HTTPException(status_code=401, detail="Token obrigatório")

    try:
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, credentials.credentials)
        uid = decoded.get("uid")
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=admin")
        raise HTTPException(status_code=401, detail="Token inválido")

    if not uid:
        logger.warning("[SECURITY] auth_invalid route=admin reason=missing_uid")
        raise HTTPException(status_code=401, detail="Token inválido")

    user_doc = await asyncio.to_thread(_fs().collection("users").document(uid).get)
    user_data = user_doc.to_dict() if user_doc.exists else {}
    if not user_doc.exists or not _is_allowed_admin_identity(decoded, user_data or {}):
        logger.warning("[SECURITY] access_denied route=admin reason=not_admin uid=%s", uid)
        raise HTTPException(status_code=403, detail="Apenas admins podem acessar este painel")

    return uid


@router.get("/recent-users")
async def recent_users(
    days: int = Query(4, ge=1, le=MAX_LOOKBACK_DAYS),
    limit: int = Query(25, ge=1, le=MAX_RECENT_USERS_LIMIT),
    admin_uid: str = Depends(_require_admin),
):
    db = _fs()
    report = await asyncio.to_thread(_build_recent_users_report, db, days=days, limit=limit)
    since = _as_utc_datetime((report.get("window") or {}).get("since")) or (datetime.now(timezone.utc) - timedelta(days=days))
    uid_list = [user["uid"] for user in report.get("users", []) if user.get("uid")]
    cotacao_activity = await _mongo_cotacao_activity_for_users(_mongo_db, uid_list, since)
    if cotacao_activity:
        report = _merge_cotacao_activity(report, cotacao_activity)
    await audit_event(
        "admin_recent_users_viewed",
        uid=admin_uid,
        status="success",
        metadata={
            "days": days,
            "limit": limit,
            "count": report["totals"]["recentUsers"],
        },
    )
    return report
