import asyncio
import logging
import os
from collections import Counter
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from threading import Lock
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth, firestore

from services.security_audit import AUDIT_COLLECTION, audit_event

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

MAX_LOOKBACK_DAYS = 30
MAX_RECENT_USERS_LIMIT = 200
AUDIT_EVENT_LIMIT = 300
STALE_AFTER_DAYS = 14
LONG_TERM_ACCOUNT_DAYS = 30
DEFAULT_ADMIN_REPORT_CACHE_TTL_SECONDS = 180
DEFAULT_ADMIN_ALLOWED_EMAILS = {"edson854_8@hotmail.com"}
_ADMIN_REPORT_CACHE: dict[tuple[int, int], dict] = {}
_ADMIN_REPORT_CACHE_LOCK = Lock()


def _fs():
    return firestore.client()


def _admin_allowed_emails() -> set[str]:
    raw = os.environ.get("ADMIN_ALLOWED_EMAILS")
    if raw is None:
        return DEFAULT_ADMIN_ALLOWED_EMAILS
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def _admin_report_cache_ttl_seconds() -> int:
    raw = os.environ.get("ADMIN_REPORT_CACHE_TTL_SECONDS")
    if raw is None:
        return DEFAULT_ADMIN_REPORT_CACHE_TTL_SECONDS
    try:
        ttl = int(raw)
    except ValueError:
        return DEFAULT_ADMIN_REPORT_CACHE_TTL_SECONDS
    return max(0, min(ttl, 600))


def clear_admin_report_cache() -> None:
    with _ADMIN_REPORT_CACHE_LOCK:
        _ADMIN_REPORT_CACHE.clear()


def _with_cache_metadata(report: dict, *, hit: bool, ttl_seconds: int, expires_in_seconds: int | None = None) -> dict:
    result = deepcopy(report)
    result["cache"] = {
        "hit": hit,
        "ttlSeconds": ttl_seconds,
        "expiresInSeconds": expires_in_seconds,
    }
    return result


def _get_cached_admin_report(days: int, limit: int) -> dict | None:
    ttl_seconds = _admin_report_cache_ttl_seconds()
    if ttl_seconds <= 0:
        return None

    cache_key = (days, limit)
    now = monotonic()
    with _ADMIN_REPORT_CACHE_LOCK:
        entry = _ADMIN_REPORT_CACHE.get(cache_key)
        if not entry:
            return None
        if entry["expiresAt"] <= now:
            _ADMIN_REPORT_CACHE.pop(cache_key, None)
            return None
        expires_in = max(0, int(entry["expiresAt"] - now))
        return _with_cache_metadata(
            entry["report"],
            hit=True,
            ttl_seconds=ttl_seconds,
            expires_in_seconds=expires_in,
        )


def _set_cached_admin_report(days: int, limit: int, report: dict) -> dict:
    ttl_seconds = _admin_report_cache_ttl_seconds()
    if ttl_seconds <= 0:
        return _with_cache_metadata(report, hit=False, ttl_seconds=0, expires_in_seconds=None)

    expires_at = monotonic() + ttl_seconds
    cache_key = (days, limit)
    with _ADMIN_REPORT_CACHE_LOCK:
        _ADMIN_REPORT_CACHE[cache_key] = {
            "expiresAt": expires_at,
            "report": deepcopy(report),
        }

    return _with_cache_metadata(
        report,
        hit=False,
        ttl_seconds=ttl_seconds,
        expires_in_seconds=ttl_seconds,
    )


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


def _public_phone(data: dict) -> str | None:
    for key in ("telefone", "phone", "whatsapp", "celular"):
        raw = data.get(key)
        if not raw:
            continue
        digits = "".join(ch for ch in str(raw) if ch.isdigit())
        if len(digits) >= 8:
            return digits[:20]
    return None


def _public_user_data(uid: str, data: dict) -> dict:
    return {
        "uid": uid,
        "email": data.get("email"),
        "name": data.get("name") or data.get("nome") or data.get("displayName"),
        "phone": _public_phone(data),
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
    first_seen = None
    last_seen = None
    login_count = 0

    for doc in devices:
        data = doc.to_dict() or {}
        first_at = _as_utc_datetime(data.get("firstSeenAt") or data.get("createdAt"))
        if first_at and (first_seen is None or first_at < first_seen):
            first_seen = first_at
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
        "firstSeenAt": _iso(first_seen),
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


def _stream_audit_docs(db, uid: str):
    query = db.collection(AUDIT_COLLECTION).where("uid", "==", uid)
    try:
        return list(
            query
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(AUDIT_EVENT_LIMIT)
            .stream()
        )
    except Exception:
        logger.warning("[ADMIN] Falha ao ordenar auditoria uid=%s; tentando sem order_by", uid, exc_info=True)

    try:
        return list(query.limit(AUDIT_EVENT_LIMIT).stream())
    except Exception:
        logger.exception("[ADMIN] Falha ao carregar auditoria uid=%s", uid)
        return []


def _audit_activity(db, uid: str, since: datetime) -> dict:
    loaded_events = []
    recent_events = []

    for doc in _stream_audit_docs(db, uid):
        data = doc.to_dict() or {}
        created_at = _event_datetime(data)
        if created_at:
            loaded_events.append(data)
        if created_at and created_at >= since:
            recent_events.append(data)

    loaded_events.sort(key=lambda item: _event_datetime(item) or datetime.min.replace(tzinfo=timezone.utc))
    recent_events.sort(key=lambda item: _event_datetime(item) or datetime.min.replace(tzinfo=timezone.utc))

    action_counts = Counter(str(event.get("action") or "unknown") for event in recent_events)
    job_ids = {
        (event.get("metadata") or {}).get("jobId")
        for event in recent_events
        if isinstance(event.get("metadata"), dict) and (event.get("metadata") or {}).get("jobId")
    }
    loaded_job_ids = {
        (event.get("metadata") or {}).get("jobId")
        for event in loaded_events
        if isinstance(event.get("metadata"), dict) and (event.get("metadata") or {}).get("jobId")
    }

    job_summaries = []
    seen_jobs = set()
    for event in reversed(recent_events):
        action = str(event.get("action") or "")
        metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
        job_id = metadata.get("jobId")
        if action != "cotatudo_extension_fill_reported" or not job_id or job_id in seen_jobs:
            continue
        seen_jobs.add(job_id)
        job_summaries.append(_compact_job_event(event))
        if len(job_summaries) >= 6:
            break

    first_event = loaded_events[0] if loaded_events else None
    last_event = loaded_events[-1] if loaded_events else None
    last_metadata = last_event.get("metadata") if isinstance(last_event, dict) and isinstance(last_event.get("metadata"), dict) else {}

    return {
        "auditEventCount": len(recent_events),
        "recentAuditEventCount": len(recent_events),
        "loadedAuditEventCount": len(loaded_events),
        "actions": dict(action_counts),
        "uniqueCotatudoJobs": len(job_ids),
        "totalCotatudoJobs": len(loaded_job_ids),
        "firstEventAt": _iso(_event_datetime(first_event)) if first_event else None,
        "lastEventAt": _iso(_event_datetime(last_event)) if last_event else None,
        "lastAction": last_event.get("action") if last_event else None,
        "lastToolSite": last_metadata.get("site"),
        "lastToolMode": last_metadata.get("modo"),
        "recentCotatudoJobs": job_summaries,
    }


def _user_created_at(doc) -> datetime:
    data = doc.to_dict() or {}
    return _as_utc_datetime(data.get("created_at") or data.get("createdAt")) or datetime.min.replace(tzinfo=timezone.utc)


def _stream_user_docs(db):
    try:
        docs = list(db.collection("users").stream())
    except Exception:
        logger.exception("[ADMIN] Falha ao consultar users")
        return []
    return sorted(
        docs,
        key=_user_created_at,
        reverse=True,
    )


def _days_since(current: datetime, value) -> int | None:
    dt = _as_utc_datetime(value)
    if not dt:
        return None
    return max(0, int((current - dt).total_seconds() // 86400))


def _latest_iso(*values) -> str | None:
    dates = [dt for dt in (_as_utc_datetime(value) for value in values) if dt]
    return _iso(max(dates)) if dates else None


def _earliest_iso(*values) -> str | None:
    dates = [dt for dt in (_as_utc_datetime(value) for value in values) if dt]
    return _iso(min(dates)) if dates else None


def _sort_by_created_desc(users: list[dict]) -> list[dict]:
    return sorted(
        users,
        key=lambda user: _as_utc_datetime(user.get("createdAt")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )


def _sort_by_activity_desc(users: list[dict]) -> list[dict]:
    return sorted(
        users,
        key=lambda user: _as_utc_datetime((user.get("activity") or {}).get("lastActivityAt")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )


def _sort_by_idle_desc(users: list[dict]) -> list[dict]:
    return sorted(
        users,
        key=lambda user: (
            (user.get("activity") or {}).get("daysSinceLastActivity") or -1,
            user.get("accountAgeDays") or -1,
        ),
        reverse=True,
    )


def _build_segments(users: list[dict], current: datetime, since: datetime) -> dict[str, list[dict]]:
    active_today_cutoff = current - timedelta(days=1)
    active_week_cutoff = current - timedelta(days=7)

    def created_after(user: dict, cutoff: datetime) -> bool:
        created_at = _as_utc_datetime(user.get("createdAt"))
        return bool(created_at and created_at >= cutoff)

    def last_activity_after(user: dict, cutoff: datetime) -> bool:
        activity_at = _as_utc_datetime((user.get("activity") or {}).get("lastActivityAt"))
        return bool(activity_at and activity_at >= cutoff)

    def stopped(user: dict) -> bool:
        activity = user.get("activity") or {}
        return bool(
            activity.get("hasToolUsage")
            and activity.get("daysSinceLastActivity") is not None
            and activity.get("daysSinceLastActivity") >= STALE_AFTER_DAYS
        )

    def long_term(user: dict) -> bool:
        return bool(user.get("accountAgeDays") is not None and user.get("accountAgeDays") >= LONG_TERM_ACCOUNT_DAYS)

    all_registered = _sort_by_created_desc(users)
    new_users = _sort_by_created_desc([user for user in users if created_after(user, since)])
    active_today = _sort_by_activity_desc([user for user in users if last_activity_after(user, active_today_cutoff)])
    active_week = _sort_by_activity_desc([user for user in users if last_activity_after(user, active_week_cutoff)])
    stopped_users = _sort_by_idle_desc([user for user in users if stopped(user)])
    old_active = _sort_by_activity_desc([user for user in users if long_term(user) and last_activity_after(user, active_week_cutoff)])
    old_stopped = _sort_by_idle_desc([user for user in users if long_term(user) and stopped(user)])
    never_used = _sort_by_created_desc([user for user in users if not (user.get("activity") or {}).get("hasToolUsage")])

    return {
        "allRegistered": all_registered,
        "newUsers": new_users,
        "activeToday": active_today,
        "activeLast7Days": active_week,
        "stoppedUsing": stopped_users,
        "oldRegisteredActive": old_active,
        "oldRegisteredStopped": old_stopped,
        "neverUsed": never_used,
    }


def _build_recent_users_report(db, *, days: int, limit: int, now: datetime | None = None) -> dict:
    current = now or datetime.now(timezone.utc)
    since = current - timedelta(days=days)
    user_docs = _stream_user_docs(db)
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
        last_activity_at = _latest_iso(device_activity.get("lastSeenAt"), audit_activity.get("lastEventAt"))
        first_activity_at = _earliest_iso(device_activity.get("firstSeenAt"), audit_activity.get("firstEventAt"))
        has_tool_usage = bool(
            last_activity_at
            or audit_activity["loadedAuditEventCount"]
            or audit_activity["totalCotatudoJobs"]
            or device_activity["loginCount"]
        )
        public_user = _public_user_data(uid, data)

        users.append({
            **public_user,
            "accountAgeDays": _days_since(current, public_user.get("createdAt")),
            "subscription": _public_subscription_data(subscription),
            "activity": {
                **device_activity,
                **audit_activity,
                "hasToolUsage": has_tool_usage,
                "firstActivityAt": first_activity_at,
                "lastActivityAt": last_activity_at,
                "daysSinceLastActivity": _days_since(current, last_activity_at),
            },
        })

    segments = _build_segments(users, current, since)
    limited_segments = {key: value[:limit] for key, value in segments.items()}

    active_trials = sum(1 for user in users if (user.get("subscription") or {}).get("status") == "trialing")
    used_tool = sum(1 for user in users if (user.get("activity") or {}).get("hasToolUsage"))
    no_usage = len(users) - used_tool

    return {
        "ok": True,
        "generatedAt": _iso(current),
        "window": {
            "days": days,
            "since": _iso(since),
            "until": _iso(current),
            "staleAfterDays": STALE_AFTER_DAYS,
            "longTermAccountDays": LONG_TERM_ACCOUNT_DAYS,
            "returnedPerSegmentLimit": limit,
        },
        "totals": {
            "registeredUsers": len(users),
            "totalRegistered": len(users),
            "recentUsers": len(segments["newUsers"]),
            "activeTrials": active_trials,
            "usedTool": used_tool,
            "noUsage": no_usage,
            "activeToday": len(segments["activeToday"]),
            "activeLast7Days": len(segments["activeLast7Days"]),
            "stoppedUsing": len(segments["stoppedUsing"]),
            "oldRegisteredActive": len(segments["oldRegisteredActive"]),
            "oldRegisteredStopped": len(segments["oldRegisteredStopped"]),
            "neverUsed": len(segments["neverUsed"]),
        },
        "segments": limited_segments,
        "users": limited_segments["newUsers"],
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
    limit: int = Query(MAX_RECENT_USERS_LIMIT, ge=1, le=MAX_RECENT_USERS_LIMIT),
    admin_uid: str = Depends(_require_admin),
):
    report = _get_cached_admin_report(days, limit)
    cache_hit = report is not None
    if report is None:
        db = _fs()
        fresh_report = await asyncio.to_thread(_build_recent_users_report, db, days=days, limit=limit)
        report = _set_cached_admin_report(days, limit, fresh_report)

    await audit_event(
        "admin_recent_users_viewed",
        uid=admin_uid,
        status="success",
        metadata={
            "days": days,
            "limit": limit,
            "count": report["totals"]["recentUsers"],
            "cacheHit": cache_hit,
        },
    )
    return report
