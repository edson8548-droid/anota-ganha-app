import asyncio
import logging
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth, firestore
from pydantic import BaseModel as pydantic_BaseModel

from services.security_audit import AUDIT_COLLECTION, audit_event

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

MAX_LOOKBACK_DAYS = 30
MAX_RECENT_USERS_LIMIT = 200
AUDIT_EVENT_LIMIT = 300
FOLLOW_UP_STALE_DAYS = 3
FOLLOW_UP_WATCH_DAYS = 1
SUSPICIOUS_TRIAL_WINDOW_DAYS = 2
SUSPICIOUS_SCORE_THRESHOLD = 5
DEFAULT_ADMIN_ALLOWED_EMAILS = {"edson854_8@hotmail.com"}
IDENTITY_STOPWORDS = {
    "admin",
    "gmail",
    "hotmail",
    "outlook",
    "yahoo",
    "live",
    "email",
    "mail",
    "com",
    "combr",
    "br",
    "loja",
    "teste",
    "usuario",
    "user",
    "rca",
}
COTACAO_READY_ACTIONS = {
    "cotacao_ready_confirmed",
    "cotacao_ready_processed",
    "cotacao_ready_preview_completed",
}
TOOL_ACTION_PREFIXES = (
    "cotacao_ready_",
    "cotatudo_extension_",
    "vitrine_",
    "whatsapp_",
)
BILLING_UPCOMING_DAYS = 7
BILLING_MONTHLY_PRICE_FALLBACK = 99.90
WEBHOOK_ALERT_ACTIONS = (
    "asaas_webhook_unmapped",
    "asaas_webhook_invalid_token",
    "asaas_webhook_token_missing",
)
WEBHOOK_ALERT_QUERY_LIMIT = 200
WEBHOOK_ALERT_RESPONSE_LIMIT = 50

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
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def _iso(value) -> str | None:
    dt = _as_utc_datetime(value)
    if not dt:
        return None
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _latest_datetime(*values) -> datetime | None:
    dates = [_as_utc_datetime(value) for value in values]
    dates = [value for value in dates if value]
    return max(dates) if dates else None


def _public_phone(data: dict) -> str | None:
    allowed_chars = set("0123456789+ ()-.")
    for key in ("phone", "telefone", "whatsapp", "celular", "mobilePhone", "mobile"):
        value = data.get(key)
        if value is None:
            continue
        phone = "".join(char for char in str(value).strip() if char in allowed_chars).strip()
        if phone:
            return phone[:40]
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


def _trial_is_active(subscription: dict | None, now: datetime | None = None) -> bool:
    if not subscription or subscription.get("status") != "trialing":
        return False
    trial_end = _as_utc_datetime(subscription.get("trialEndsAt"))
    return bool(trial_end and trial_end > (now or datetime.now(timezone.utc)))


def _paid_access_until(subscription: dict | None) -> datetime | None:
    if not subscription:
        return None

    access_end = _as_utc_datetime(subscription.get("accessEndsAt"))
    if access_end:
        return access_end

    last_payment = _as_utc_datetime(subscription.get("lastPaymentDate"))
    if last_payment:
        return last_payment + timedelta(days=30)

    return None


def _has_current_access(subscription: dict | None, now: datetime | None = None) -> bool:
    if not subscription:
        return False

    current = now or datetime.now(timezone.utc)
    status = subscription.get("status")
    if status == "active":
        return True
    if status == "trialing":
        return _trial_is_active(subscription, current)
    if status in {"canceling", "canceled"}:
        paid_until = _paid_access_until(subscription)
        return bool(paid_until and paid_until > current)
    return False


def _device_profile(user_ref) -> tuple[dict, set[str]]:
    devices = list(user_ref.collection("devices").stream())
    last_seen = None
    login_count = 0
    device_keys = set()

    for doc in devices:
        if getattr(doc, "id", None):
            device_keys.add(str(doc.id))
        data = doc.to_dict() or {}
        seen_at = _as_utc_datetime(data.get("lastSeenAt"))
        if seen_at and (last_seen is None or seen_at > last_seen):
            last_seen = seen_at
        try:
            login_count += int(data.get("loginCount") or 0)
        except (TypeError, ValueError):
            pass

    return (
        {
            "deviceCount": len(devices),
            "loginCount": login_count,
            "lastSeenAt": _iso(last_seen),
        },
        device_keys,
    )


def _device_activity(user_ref) -> dict:
    activity, _device_keys = _device_profile(user_ref)
    return activity


def _event_datetime(event: dict) -> datetime | None:
    return _as_utc_datetime(event.get("createdAt") or event.get("createdAtIso"))


def _is_tool_action(action: str) -> bool:
    return action.startswith(TOOL_ACTION_PREFIXES)


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


def _compact_recent_event(event: dict) -> dict:
    action = str(event.get("action") or "unknown")
    status = str(event.get("status") or "")
    metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
    created_at = _iso(event.get("createdAt") or event.get("createdAtIso"))
    base = {
        "createdAt": created_at,
        "action": action,
        "status": status,
        "label": action.replace("_", " "),
        "detail": status or "Registrado",
        "tone": "neutral",
    }

    if action == "device_session_registered":
        return {
            **base,
            "label": "Sessão registrada",
            "detail": "Novo dispositivo" if metadata.get("newDevice") else "Dispositivo já registrado",
        }

    if action == "welcome_email_sent":
        return {
            **base,
            "label": "Email de boas-vindas",
            "detail": "Enviado para o RCA",
        }

    if action == "vitrine_list_parsed":
        items = metadata.get("items")
        return {
            **base,
            "label": "Vitrine processada",
            "detail": f"{items} item{'' if items == 1 else 's'} lido{'' if items == 1 else 's'}" if isinstance(items, int) else "Lista lida",
            "tone": "ok",
        }

    if action == "cotatudo_extension_fill_reported":
        job = _compact_job_event(event)
        total = job.get("totalItens") or 0
        preenchidos = job.get("preenchidos") or 0
        nao_encontrados = job.get("naoEncontrados") or 0
        context = " · ".join(
            str(value)
            for value in (job.get("site") or "Cotatudo", job.get("modo"), f"{job.get('prazo')} dias" if job.get("prazo") else None)
            if value
        )
        return {
            **base,
            "label": "Cotatudo preenchido",
            "detail": f"{context} · {preenchidos}/{total} preenchidos · {nao_encontrados} não encontrados",
            "tone": "ok" if preenchidos else "warn",
        }

    if action in COTACAO_READY_ACTIONS:
        job = _compact_cotacao_ready_event(event)
        total = job.get("totalItens") or 0
        preenchidos = job.get("preenchidos") or 0
        sem_match = job.get("semMatch") or 0
        context = " · ".join(
            str(value)
            for value in ("Cotação Pronta", job.get("modo"), f"{job.get('prazo')} dias" if job.get("prazo") else None)
            if value
        )
        return {
            **base,
            "label": "Cotação Pronta",
            "detail": f"{context} · {preenchidos}/{total} preenchidos · {sem_match} sem match",
            "tone": "ok" if preenchidos else "warn",
        }

    return base


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
    tool_events = [
        event
        for event in events
        if _is_tool_action(str(event.get("action") or ""))
    ]
    tool_event_count = sum(
        1
        for _event in tool_events
    )
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
    last_tool_event = tool_events[-1] if tool_events else None
    last_metadata = last_event.get("metadata") if isinstance(last_event, dict) and isinstance(last_event.get("metadata"), dict) else {}
    last_tool_metadata = last_tool_event.get("metadata") if isinstance(last_tool_event, dict) and isinstance(last_tool_event.get("metadata"), dict) else {}
    recent_events = [
        _compact_recent_event(event)
        for event in list(reversed(events))[:8]
    ]
    recent_tool_events = [
        _compact_recent_event(event)
        for event in list(reversed(tool_events))[:4]
    ]

    return {
        "auditEventCount": len(events),
        "toolEventCount": tool_event_count,
        "actions": dict(action_counts),
        "uniqueCotatudoJobs": len(job_ids),
        "cotacaoReadyCount": len(cotacao_ready_ids),
        "firstEventAt": _iso(_event_datetime(events[0])) if events else None,
        "lastEventAt": _iso(_event_datetime(last_event)) if last_event else None,
        "lastAction": last_event.get("action") if last_event else None,
        "lastToolUseAt": _iso(_event_datetime(last_tool_event)) if last_tool_event else None,
        "lastToolAction": last_tool_event.get("action") if last_tool_event else None,
        "lastToolSite": last_tool_metadata.get("site") or last_metadata.get("site"),
        "lastToolMode": last_tool_metadata.get("modo") or last_metadata.get("modo"),
        "recentEvents": recent_events,
        "recentToolEvents": recent_tool_events,
        "recentCotatudoJobs": job_summaries,
        "recentCotacaoReadyJobs": cotacao_ready_summaries,
    }


def _stream_user_docs(db):
    try:
        return list(db.collection("users").stream())
    except Exception:
        logger.warning("[ADMIN] Falha ao consultar users", exc_info=True)
        return []


def _user_created_at(user: dict) -> datetime | None:
    return _as_utc_datetime(user.get("createdAt"))


def _last_activity_at(user: dict) -> datetime | None:
    activity = user.get("activity") or {}
    return _latest_datetime(
        activity.get("lastToolUseAt"),
        activity.get("lastSeenAt"),
        activity.get("lastEventAt"),
        user.get("updatedAt"),
    )


def _sort_by_created_desc(users: list[dict]) -> list[dict]:
    fallback = datetime.min.replace(tzinfo=timezone.utc)
    return sorted(
        users,
        key=lambda user: _user_created_at(user) or _as_utc_datetime(user.get("updatedAt")) or fallback,
        reverse=True,
    )


def _sort_by_activity_desc(users: list[dict]) -> list[dict]:
    fallback = datetime.min.replace(tzinfo=timezone.utc)
    return sorted(
        users,
        key=lambda user: _last_activity_at(user) or fallback,
        reverse=True,
    )


def _unique_users_by_uid(users: list[dict]) -> list[dict]:
    unique = {}
    for user in users:
        uid = user.get("uid")
        if uid and uid not in unique:
            unique[uid] = user
    return list(unique.values())


def _digits_only(value) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def _document_digits(data: dict) -> str | None:
    for key in ("cpf", "document", "documento", "cpfCnpj", "cpf_cnpj", "taxId"):
        digits = _digits_only(data.get(key))
        if len(digits) in {11, 14}:
            return digits
    return None


def _phone_ddd(phone_digits: str) -> str | None:
    if phone_digits.startswith("55") and len(phone_digits) >= 12:
        return phone_digits[2:4]
    if len(phone_digits) >= 10:
        return phone_digits[:2]
    return None


def _normalize_identity_text(value) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", without_accents.lower()).strip()


def _email_local_part(email) -> str:
    local = str(email or "").split("@", 1)[0]
    return re.sub(r"[^a-z0-9]+", "", _normalize_identity_text(local))


def _identity_tokens(name, email) -> set[str]:
    local = str(email or "").split("@", 1)[0].replace(".", " ").replace("_", " ").replace("-", " ")
    words = _normalize_identity_text(f"{name or ''} {local}").split()
    return {
        word
        for word in words
        if len(word) >= 4 and word not in IDENTITY_STOPWORDS and not word.isdigit()
    }


def _longest_common_substring_len(first: str, second: str) -> int:
    if not first or not second:
        return 0

    previous = [0] * (len(second) + 1)
    best = 0
    for char_first in first:
        current = [0] * (len(second) + 1)
        for idx, char_second in enumerate(second, start=1):
            if char_first == char_second:
                current[idx] = previous[idx - 1] + 1
                best = max(best, current[idx])
        previous = current
    return best


def _identity_match_reason(profile_a: dict, profile_b: dict) -> str | None:
    tokens_a = profile_a.get("identityTokens") or set()
    tokens_b = profile_b.get("identityTokens") or set()
    if tokens_a & tokens_b:
        return "Nome ou e-mail parecido"

    for token_a in tokens_a:
        for token_b in tokens_b:
            smaller = min(len(token_a), len(token_b))
            if smaller >= 6 and (token_a in token_b or token_b in token_a):
                return "Nome ou e-mail parecido"

    email_a = profile_a.get("emailLocal") or ""
    email_b = profile_b.get("emailLocal") or ""
    if _longest_common_substring_len(email_a, email_b) >= 7:
        return "E-mails com trecho parecido"
    return None


def _trial_timing_matches(profile_a: dict, profile_b: dict) -> bool:
    window = timedelta(days=SUSPICIOUS_TRIAL_WINDOW_DAYS)
    for newer, older in ((profile_a, profile_b), (profile_b, profile_a)):
        newer_created = newer.get("createdAt")
        older_created = older.get("createdAt")
        older_trial_end = older.get("trialEndsAt")
        if not newer_created or not older_trial_end:
            continue
        if older_created and newer_created < older_created:
            continue
        if abs(newer_created - older_trial_end) <= window:
            return True
    return False


def _related_user_summary(user: dict) -> dict:
    subscription = user.get("subscription") if isinstance(user.get("subscription"), dict) else None
    return {
        "uid": user.get("uid"),
        "name": user.get("name"),
        "email": user.get("email"),
        "phone": user.get("phone"),
        "createdAt": user.get("createdAt"),
        "subscription": {
            "planId": subscription.get("planId"),
            "status": subscription.get("status"),
            "trialEndsAt": subscription.get("trialEndsAt"),
        } if subscription else None,
    }


def _suspicion_profile(uid: str, source_data: dict, public_user: dict, device_keys: set[str]) -> dict:
    phone_digits = _digits_only(public_user.get("phone"))
    subscription = public_user.get("subscription") if isinstance(public_user.get("subscription"), dict) else {}
    return {
        "uid": uid,
        "createdAt": _as_utc_datetime(public_user.get("createdAt")),
        "trialEndsAt": _as_utc_datetime(subscription.get("trialEndsAt")),
        "documentDigits": _document_digits(source_data),
        "phoneDigits": phone_digits,
        "phoneDdd": _phone_ddd(phone_digits),
        "deviceKeys": set(device_keys or set()),
        "identityTokens": _identity_tokens(public_user.get("name"), public_user.get("email")),
        "emailLocal": _email_local_part(public_user.get("email")),
        "public": _related_user_summary(public_user),
    }


def _empty_risk() -> dict:
    return {
        "suspicious": False,
        "score": 0,
        "level": "low",
        "label": "Sem sinal forte",
        "reasons": [],
        "relatedUsers": [],
    }


def _suspicious_pair_score(profile_a: dict, profile_b: dict) -> tuple[int, list[str]]:
    score = 0
    reasons = []
    has_identity_or_strong_signal = False

    document_a = profile_a.get("documentDigits")
    document_b = profile_b.get("documentDigits")
    if document_a and document_b and document_a == document_b:
        score += 8
        has_identity_or_strong_signal = True
        reasons.append("Mesmo documento em outro cadastro")

    phone_a = profile_a.get("phoneDigits")
    phone_b = profile_b.get("phoneDigits")
    if phone_a and phone_b and phone_a == phone_b and len(phone_a) >= 10:
        score += 7
        has_identity_or_strong_signal = True
        reasons.append("Mesmo número em outro cadastro")

    if (profile_a.get("deviceKeys") or set()) & (profile_b.get("deviceKeys") or set()):
        score += 6
        has_identity_or_strong_signal = True
        reasons.append("Mesmo aparelho em outro cadastro")

    ddd_a = profile_a.get("phoneDdd")
    ddd_b = profile_b.get("phoneDdd")
    if ddd_a and ddd_b and ddd_a == ddd_b:
        score += 1
        reasons.append("Mesmo DDD no número cadastrado")

    identity_reason = _identity_match_reason(profile_a, profile_b)
    if identity_reason:
        score += 2
        has_identity_or_strong_signal = True
        reasons.append(identity_reason)

    if _trial_timing_matches(profile_a, profile_b):
        score += 4
        reasons.append("Novo cadastro perto do fim do trial de outro RCA")

    if score < SUSPICIOUS_SCORE_THRESHOLD or not has_identity_or_strong_signal:
        return 0, []
    return score, reasons


def _append_risk_match(user: dict, *, score: int, reasons: list[str], related: dict) -> None:
    risk = user.setdefault("risk", _empty_risk())
    risk["score"] = int(risk.get("score") or 0) + score
    existing_reasons = set(risk.get("reasons") or [])
    for reason in reasons:
        if reason not in existing_reasons:
            risk.setdefault("reasons", []).append(reason)
            existing_reasons.add(reason)

    related_uid = related.get("uid")
    related_users = risk.setdefault("relatedUsers", [])
    if related_uid and all(item.get("uid") != related_uid for item in related_users):
        related_users.append(related)


def _apply_suspicious_signals(users: list[dict], profiles: dict[str, dict]) -> None:
    users_by_uid = {user.get("uid"): user for user in users if user.get("uid")}
    for user in users_by_uid.values():
        user["risk"] = _empty_risk()

    uids = [uid for uid in users_by_uid if uid in profiles]
    for index, uid_a in enumerate(uids):
        profile_a = profiles[uid_a]
        for uid_b in uids[index + 1:]:
            profile_b = profiles[uid_b]
            score, reasons = _suspicious_pair_score(profile_a, profile_b)
            if not score:
                continue
            _append_risk_match(users_by_uid[uid_a], score=score, reasons=reasons, related=profile_b["public"])
            _append_risk_match(users_by_uid[uid_b], score=score, reasons=reasons, related=profile_a["public"])

    for user in users_by_uid.values():
        risk = user.get("risk") or _empty_risk()
        if not risk.get("relatedUsers"):
            user["risk"] = _empty_risk()
            continue
        score = int(risk.get("score") or 0)
        risk["suspicious"] = True
        risk["score"] = score
        risk["level"] = "high" if score >= 8 else "medium"
        risk["label"] = "Possível cadastro duplicado"
        risk["relatedUsers"] = _sort_by_created_desc(risk.get("relatedUsers") or [])
        user["risk"] = risk


def _sort_suspicious_users(users: list[dict]) -> list[dict]:
    fallback = datetime.min.replace(tzinfo=timezone.utc)
    return sorted(
        users,
        key=lambda user: (
            int((user.get("risk") or {}).get("score") or 0),
            _user_created_at(user) or fallback,
        ),
        reverse=True,
    )


def _build_segments(users: list[dict], *, since: datetime, now: datetime, limit: int) -> dict:
    active_today_since = now - timedelta(days=1)
    active_week_since = now - timedelta(days=7)

    all_registered = _sort_by_created_desc(users)
    new_users = [
        user
        for user in all_registered
        if (_user_created_at(user) and _user_created_at(user) >= since)
    ]
    active_today = [
        user
        for user in users
        if (_last_activity_at(user) and _last_activity_at(user) >= active_today_since)
    ]
    active_last_7_days = [
        user
        for user in users
        if (_last_activity_at(user) and _last_activity_at(user) >= active_week_since)
    ]
    stopped_using = [
        user
        for user in users
        if (user.get("followUp") or {}).get("status") == "stopped"
    ]
    needs_contact = [
        user
        for user in users
        if (user.get("followUp") or {}).get("shouldContact")
    ]
    suspicious_users = [
        user
        for user in users
        if (user.get("risk") or {}).get("suspicious")
    ]
    never_used = [
        user
        for user in users
        if not (user.get("activity") or {}).get("hasToolUsage")
    ]

    return {
        "allRegistered": all_registered[:limit],
        "newUsers": new_users[:limit],
        "activeToday": _sort_by_activity_desc(active_today)[:limit],
        "activeLast7Days": _sort_by_activity_desc(active_last_7_days)[:limit],
        "stoppedUsing": _sort_by_activity_desc(stopped_using)[:limit],
        "needsContact": _sort_by_activity_desc(needs_contact)[:limit],
        "suspiciousUsers": _sort_suspicious_users(suspicious_users)[:limit],
        "neverUsed": _sort_by_created_desc(never_used)[:limit],
    }


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
    active_trials = sum(1 for user in users if _trial_is_active(user.get("subscription")))
    used_tool = sum(1 for user in users if (user.get("activity") or {}).get("hasToolUsage"))
    no_usage = len(users) - used_tool
    needs_contact = sum(1 for user in users if (user.get("followUp") or {}).get("shouldContact"))
    stopped_after_use = sum(1 for user in users if (user.get("followUp") or {}).get("status") == "stopped")
    suspicious_users = sum(1 for user in users if (user.get("risk") or {}).get("suspicious"))
    return {
        "recentUsers": len(users),
        "activeTrials": active_trials,
        "usedTool": used_tool,
        "noUsage": no_usage,
        "needsContact": needs_contact,
        "stoppedAfterUse": stopped_after_use,
        "suspiciousUsers": suspicious_users,
    }


def _compute_report_totals(all_users: list[dict], recent_users: list[dict], now: datetime | None = None) -> dict:
    totals = _recompute_totals(all_users)
    current = now or datetime.now(timezone.utc)
    active_today_since = current - timedelta(days=1)
    active_week_since = current - timedelta(days=7)

    totals.update({
        "registeredUsers": len(all_users),
        "totalRegistered": len(all_users),
        "recentUsers": len(recent_users),
        "activeToday": sum(
            1
            for user in all_users
            if (_last_activity_at(user) and _last_activity_at(user) >= active_today_since)
        ),
        "activeLast7Days": sum(
            1
            for user in all_users
            if (_last_activity_at(user) and _last_activity_at(user) >= active_week_since)
        ),
        "stoppedUsing": sum(
            1
            for user in all_users
            if (user.get("followUp") or {}).get("status") == "stopped"
        ),
        "neverUsed": sum(
            1
            for user in all_users
            if not (user.get("activity") or {}).get("hasToolUsage")
        ),
    })
    return totals


def _days_since(value, now: datetime) -> int | None:
    dt = _as_utc_datetime(value)
    if not dt:
        return None
    return max(0, int((now - dt).total_seconds() // 86400))


def _follow_up_status(user: dict, now: datetime) -> dict:
    subscription = user.get("subscription") or {}
    activity = user.get("activity") or {}
    has_access = _has_current_access(subscription, now)
    has_tool_usage = bool(activity.get("hasToolUsage"))
    last_tool_use_at = activity.get("lastToolUseAt")
    days_since_tool = _days_since(last_tool_use_at, now)
    days_since_session = _days_since(activity.get("lastSeenAt"), now)

    base = {
        "lastToolUseAt": last_tool_use_at,
        "daysSinceToolUse": days_since_tool,
        "daysSinceSession": days_since_session,
        "shouldContact": False,
        "priority": "low",
        "tone": "neutral",
    }

    if not has_access:
        status = subscription.get("status")
        trial_end = _as_utc_datetime(subscription.get("trialEndsAt"))
        if status == "pending" and trial_end and trial_end > now:
            return {
                **base,
                "status": "access_pending",
                "label": "Acesso pendente",
                "reason": "Chamar para destravar o acesso antes do primeiro uso.",
                "shouldContact": True,
                "priority": "high",
                "tone": "warn",
            }
        label = "Trial vencido" if status == "trialing" else "Acesso vencido"
        return {
            **base,
            "status": "access_expired",
            "label": label,
            "reason": "Chamar para entender se quer renovar ou se travou no pagamento.",
            "shouldContact": True,
            "priority": "high",
            "tone": "danger",
        }

    if not has_tool_usage:
        return {
            **base,
            "status": "never_used",
            "label": "Nunca testou",
            "reason": "Chamar para ajudar no primeiro uso.",
            "shouldContact": True,
            "priority": "medium",
            "tone": "warn",
        }

    if days_since_tool is None:
        return {
            **base,
            "status": "used_unknown_time",
            "label": "Usou sem data",
            "reason": "Verificar manualmente o histórico.",
            "shouldContact": True,
            "priority": "medium",
            "tone": "warn",
        }

    if days_since_tool >= FOLLOW_UP_STALE_DAYS:
        return {
            **base,
            "status": "stopped",
            "label": f"Parou há {days_since_tool}d",
            "reason": "Chamar para perguntar se travou ou ficou descontente.",
            "shouldContact": True,
            "priority": "high",
            "tone": "danger",
        }

    if days_since_tool >= FOLLOW_UP_WATCH_DAYS:
        return {
            **base,
            "status": "watch",
            "label": f"Sem uso há {days_since_tool}d",
            "reason": "Acompanhar; chamar se completar alguns dias sem usar.",
            "priority": "medium",
            "tone": "warn",
        }

    return {
        **base,
        "status": "active",
        "label": "Usando",
        "reason": "Uso recente registrado.",
        "tone": "ok",
    }


def _apply_follow_up_status(users: list[dict], now: datetime) -> None:
    for user in users:
        user["followUp"] = _follow_up_status(user, now)


def _report_user_refs(report: dict) -> list[dict]:
    refs = []
    for user in report.get("users", []):
        if isinstance(user, dict):
            refs.append(user)

    segments = report.get("segments") if isinstance(report.get("segments"), dict) else {}
    for segment_users in segments.values():
        if not isinstance(segment_users, list):
            continue
        for user in segment_users:
            if isinstance(user, dict):
                refs.append(user)

    return _unique_users_by_uid(refs)


def _report_registered_users(report: dict) -> list[dict]:
    segments = report.get("segments") if isinstance(report.get("segments"), dict) else {}
    all_registered = segments.get("allRegistered") if isinstance(segments, dict) else None
    if isinstance(all_registered, list):
        return _unique_users_by_uid([user for user in all_registered if isinstance(user, dict)])
    return _unique_users_by_uid([user for user in report.get("users", []) if isinstance(user, dict)])


def _merge_cotacao_activity(report: dict, activity_by_uid: dict[str, dict]) -> dict:
    generated_at = _as_utc_datetime(report.get("generatedAt")) or datetime.now(timezone.utc)
    for user in _report_user_refs(report):
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

        last_extra_seen = _latest_datetime(
            extra.get("lastCotacaoReadyAt"),
            extra.get("lastCotacaoTableUploadAt"),
        )
        if last_extra_seen:
            current_last = _as_utc_datetime(activity.get("lastToolUseAt"))
            extra_last = _as_utc_datetime(last_extra_seen)
            if extra_last and (current_last is None or extra_last > current_last):
                activity["lastToolUseAt"] = _iso(extra_last)
                activity["lastToolAction"] = "cotacao_ready_session"
                activity["lastEventAt"] = _iso(extra_last)
                activity["lastAction"] = "cotacao_ready_session"
                activity["lastToolSite"] = "cotacao_pronta"

        activity["hasToolUsage"] = bool(
            activity.get("hasToolUsage")
            or activity.get("cotacaoReadyCount")
            or activity.get("cotacaoTableUploads")
            or activity.get("cotacaoLearnedMatches")
        )

    if not isinstance(report.get("segments"), dict):
        _apply_follow_up_status(report.get("users", []), generated_at)
        report["totals"] = _recompute_totals(report.get("users", []))
        return report

    registered_users = _report_registered_users(report)
    _apply_follow_up_status(_report_user_refs(report), generated_at)
    report["segments"] = _build_segments(
        registered_users,
        since=_as_utc_datetime((report.get("window") or {}).get("since")) or generated_at,
        now=generated_at,
        limit=int((report.get("window") or {}).get("limit") or MAX_RECENT_USERS_LIMIT),
    )
    report["users"] = report["segments"]["newUsers"]
    report["totals"] = _compute_report_totals(registered_users, report["users"], generated_at)
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
            "lastCotacaoTableUploadAt": None,
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
                {"user_id": 1, "data_upload": 1},
            )
            .limit(MAX_RECENT_USERS_LIMIT * 20)
            .to_list(length=MAX_RECENT_USERS_LIMIT * 20)
        )
        for table in tables:
            uid = table.get("user_id")
            if uid in activity_by_uid:
                activity_by_uid[uid]["cotacaoTableUploads"] += 1
                upload_dt = _as_utc_datetime(table.get("data_upload"))
                current_upload_dt = _as_utc_datetime(activity_by_uid[uid].get("lastCotacaoTableUploadAt"))
                if upload_dt and (current_upload_dt is None or upload_dt > current_upload_dt):
                    activity_by_uid[uid]["lastCotacaoTableUploadAt"] = _iso(upload_dt)

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
    activity_since = current - timedelta(days=MAX_LOOKBACK_DAYS)
    user_docs = _stream_user_docs(db)
    users = []
    suspicion_profiles = {}

    for doc in user_docs:
        uid = doc.id
        data = doc.to_dict() or {}
        if data.get("role") == "admin":
            continue

        user_ref = db.collection("users").document(uid)
        sub_doc = db.collection("subscriptions").document(uid).get()
        subscription = sub_doc.to_dict() if getattr(sub_doc, "exists", False) else None

        device_activity, device_keys = _device_profile(user_ref)
        audit_activity = _audit_activity(db, uid, activity_since)
        has_tool_usage = bool(
            audit_activity["toolEventCount"]
            or audit_activity["uniqueCotatudoJobs"]
            or audit_activity["cotacaoReadyCount"]
        )

        user_payload = {
            **_public_user_data(uid, data),
            "subscription": _public_subscription_data(subscription),
            "activity": {
                **device_activity,
                **audit_activity,
                "hasToolUsage": has_tool_usage,
            },
        }
        users.append(user_payload)
        suspicion_profiles[uid] = _suspicion_profile(uid, data, user_payload, device_keys)

    _apply_follow_up_status(users, current)
    _apply_suspicious_signals(users, suspicion_profiles)
    segments = _build_segments(users, since=since, now=current, limit=limit)
    report = {
        "ok": True,
        "generatedAt": _iso(current),
        "window": {
            "days": days,
            "since": _iso(since),
            "activitySince": _iso(activity_since),
            "until": _iso(current),
            "limit": limit,
        },
        "totals": _compute_report_totals(users, segments["newUsers"], current),
        "segments": segments,
        "users": segments["newUsers"],
    }
    return report


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


def _billing_amount(subscription: dict) -> float:
    try:
        amount = float(subscription.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0.0
    return amount if amount > 0 else BILLING_MONTHLY_PRICE_FALLBACK


def _billing_user_entry(db, uid: str, subscription: dict, cache: dict) -> dict:
    if uid not in cache:
        user_doc = db.collection("users").document(uid).get()
        data = user_doc.to_dict() if getattr(user_doc, "exists", False) else {}
        data = data or {}
        cache[uid] = {
            "uid": uid,
            "name": data.get("name") or data.get("nome") or data.get("displayName"),
            "email": data.get("email"),
            "phone": _public_phone(data),
        }
    entry = dict(cache[uid])
    entry.update(
        {
            "status": subscription.get("status"),
            "planId": subscription.get("planId"),
            "amount": _billing_amount(subscription),
            "nextDueDate": _iso(subscription.get("nextDueDate")),
            "lastPaymentDate": _iso(subscription.get("lastPaymentDate")),
            "currentPeriodEnd": _iso(subscription.get("currentPeriodEnd")),
            "accessEndsAt": _iso(subscription.get("accessEndsAt")),
            "trialEndsAt": _iso(subscription.get("trialEndsAt")),
        }
    )
    return entry


def _webhook_alerts(db, since: datetime) -> list[dict]:
    alerts = []
    for action in WEBHOOK_ALERT_ACTIONS:
        try:
            docs = (
                db.collection(AUDIT_COLLECTION)
                .where("action", "==", action)
                .limit(WEBHOOK_ALERT_QUERY_LIMIT)
                .stream()
            )
        except Exception:
            logger.exception("[ADMIN] Falha ao carregar alertas de webhook action=%s", action)
            continue
        for doc in docs:
            data = doc.to_dict() or {}
            created_at = _event_datetime(data)
            if not created_at or created_at < since:
                continue
            metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
            alerts.append(
                {
                    "action": action,
                    "status": data.get("status"),
                    "uid": data.get("uid"),
                    "event": metadata.get("event"),
                    "createdAt": _iso(created_at),
                }
            )
    alerts.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
    return alerts[:WEBHOOK_ALERT_RESPONSE_LIMIT]


def _build_billing_overview(db, *, days: int, now: datetime | None = None) -> dict:
    current = now or datetime.now(timezone.utc)
    since = current - timedelta(days=days)
    upcoming_until = current + timedelta(days=BILLING_UPCOMING_DAYS)

    counts = Counter()
    mrr = 0.0
    user_cache: dict = {}
    active_subscribers = []
    upcoming_renewals = []
    payment_issues = []

    for doc in db.collection("subscriptions").stream():
        subscription = doc.to_dict() or {}
        uid = doc.id
        status = subscription.get("status") or "none"

        if status == "active":
            counts["active"] += 1
            mrr += _billing_amount(subscription)
            entry = _billing_user_entry(db, uid, subscription, user_cache)
            active_subscribers.append(entry)

            next_due = _as_utc_datetime(subscription.get("nextDueDate"))
            if next_due and next_due <= upcoming_until:
                upcoming_renewals.append(entry)
        elif status == "trialing":
            if _trial_is_active(subscription, current):
                counts["trialingActive"] += 1
            else:
                counts["trialExpired"] += 1
        elif status == "trial_expired":
            counts["trialExpired"] += 1
        elif status == "pending":
            counts["pendingPayment"] += 1
            payment_issues.append(_billing_user_entry(db, uid, subscription, user_cache))
        elif status == "canceling":
            counts["canceling"] += 1
        elif status == "canceled":
            counts["canceled"] += 1
        else:
            counts["other"] += 1

        issue_at = _as_utc_datetime(subscription.get("lastPaymentIssueAt"))
        if status != "pending" and issue_at and issue_at >= since:
            entry = _billing_user_entry(db, uid, subscription, user_cache)
            entry["paymentIssueEvent"] = subscription.get("lastPaymentIssueEvent")
            entry["paymentIssueAt"] = _iso(issue_at)
            payment_issues.append(entry)

    webhook_alerts = _webhook_alerts(db, since)

    active_subscribers.sort(key=lambda item: item.get("nextDueDate") or "9999")
    upcoming_renewals.sort(key=lambda item: item.get("nextDueDate") or "9999")

    return {
        "window": {
            "days": days,
            "since": _iso(since),
            "until": _iso(current),
            "upcomingUntil": _iso(upcoming_until),
        },
        "totals": {
            "activeSubscribers": counts["active"],
            "monthlyRevenueEstimate": round(mrr, 2),
            "trialingActive": counts["trialingActive"],
            "trialExpired": counts["trialExpired"],
            "pendingPayment": counts["pendingPayment"],
            "canceling": counts["canceling"],
            "canceled": counts["canceled"],
            "paymentIssues": len(payment_issues),
            "webhookAlerts": len(webhook_alerts),
            "upcomingRenewals": len(upcoming_renewals),
        },
        "activeSubscribers": active_subscribers,
        "upcomingRenewals": upcoming_renewals,
        "paymentIssues": payment_issues,
        "webhookAlerts": webhook_alerts,
    }


@router.get("/billing-overview")
async def billing_overview(
    days: int = Query(7, ge=1, le=MAX_LOOKBACK_DAYS),
    admin_uid: str = Depends(_require_admin),
):
    db = _fs()
    report = await asyncio.to_thread(_build_billing_overview, db, days=days)
    await audit_event(
        "admin_billing_viewed",
        uid=admin_uid,
        status="success",
        metadata={
            "days": days,
            "activeSubscribers": report["totals"]["activeSubscribers"],
            "webhookAlerts": report["totals"]["webhookAlerts"],
        },
    )
    return report


@router.get("/recent-users")
async def recent_users(
    days: int = Query(4, ge=1, le=MAX_LOOKBACK_DAYS),
    limit: int = Query(25, ge=1, le=MAX_RECENT_USERS_LIMIT),
    admin_uid: str = Depends(_require_admin),
):
    db = _fs()
    report = await asyncio.to_thread(_build_recent_users_report, db, days=days, limit=limit)
    window = report.get("window") or {}
    since = _as_utc_datetime(window.get("activitySince") or window.get("since")) or (datetime.now(timezone.utc) - timedelta(days=MAX_LOOKBACK_DAYS))
    segments = report.get("segments") if isinstance(report.get("segments"), dict) else {}
    registered_users = segments.get("allRegistered") if isinstance(segments.get("allRegistered"), list) else report.get("users", [])
    uid_list = [user["uid"] for user in registered_users if user.get("uid")]
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
            "registeredUsers": report["totals"].get("registeredUsers"),
        },
    )
    return report


# ─── Gerenciamento de trial APK ────────────────────────────────────────────────

def _normalize(text: str) -> str:
    return unicodedata.normalize("NFD", text or "").encode("ascii", "ignore").decode().lower()


@router.get("/apk-search-user")
async def apk_search_user(
    q: str = Query(..., min_length=2),
    admin_uid: str = Depends(_require_admin),
):
    """Busca usuarios por nome ou CPF para gerenciar trial do APK."""
    db = _fs()
    q_norm = _normalize(q)
    q_digits = re.sub(r"[^\d]", "", q)

    users_ref = db.collection("users").limit(300)
    docs = await asyncio.to_thread(lambda: list(users_ref.stream()))

    results = []
    for doc in docs:
        data = doc.to_dict()
        name = data.get("name") or data.get("nome") or ""
        cpf = data.get("cpf") or ""
        if q_norm in _normalize(name) or (q_digits and q_digits in cpf):
            sub_doc = await asyncio.to_thread(
                lambda uid=doc.id: db.collection("subscriptions").document(uid).get()
            )
            sub = sub_doc.to_dict() if sub_doc.exists else {}
            trial_end = _iso(sub.get("trialEndsAt"))
            results.append({
                "uid": doc.id,
                "name": name,
                "email": data.get("email"),
                "cpf": cpf,
                "subscriptionStatus": sub.get("status") or "sem assinatura",
                "trialEndsAt": trial_end,
            })

    return {"users": results[:20]}


class SetTrialRequest(pydantic_BaseModel):
    uid: str
    days: int = 15


@router.post("/apk-set-trial")
async def apk_set_trial(
    payload: SetTrialRequest,
    admin_uid: str = Depends(_require_admin),
):
    """Define trial de N dias para um RCA identificado pelo uid."""
    if payload.days < 1 or payload.days > 365:
        raise HTTPException(400, "Dias deve ser entre 1 e 365")

    db = _fs()
    user_ref = db.collection("users").document(payload.uid)
    user_doc = await asyncio.to_thread(user_ref.get)
    if not user_doc.exists:
        raise HTTPException(404, "Usuario nao encontrado")

    user_data = user_doc.to_dict()
    now = datetime.now(timezone.utc)
    trial_end = now + timedelta(days=payload.days)

    sub_ref = db.collection("subscriptions").document(payload.uid)
    await asyncio.to_thread(
        sub_ref.set,
        {
            "userId": payload.uid,
            "status": "trialing",
            "trialEndsAt": trial_end,
            "updatedAt": now,
            "grantedBy": admin_uid,
        },
        True,  # merge=True
    )

    logger.info(f"Trial concedido: uid={payload.uid} dias={payload.days} admin={admin_uid}")
    await audit_event(
        "admin_apk_trial_granted",
        uid=admin_uid,
        status="success",
        metadata={"target_uid": payload.uid, "days": payload.days},
    )
    return {
        "success": True,
        "name": user_data.get("name") or user_data.get("nome"),
        "trialEndsAt": trial_end.isoformat(),
        "days": payload.days,
    }
