import sys
import os
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.subscription_access import _as_datetime, _has_paid_access, _subscription_has_access


def test_as_datetime_accepts_iso_zulu_string():
    value = _as_datetime("2026-05-11T12:00:00Z")

    assert value == datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc)


def test_as_datetime_adds_timezone_to_naive_datetime():
    value = _as_datetime(datetime(2026, 5, 11, 12, 0))

    assert value.tzinfo == timezone.utc


def test_has_paid_access_uses_access_end():
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)

    assert _has_paid_access({"accessEndsAt": now + timedelta(days=1)}, now)


def test_has_paid_access_uses_recent_payment_grace_period():
    now = datetime(2026, 5, 11, tzinfo=timezone.utc)

    assert _has_paid_access({"lastPaymentDate": now - timedelta(days=29)}, now)
    assert not _has_paid_access({"lastPaymentDate": now - timedelta(days=31)}, now)


def test_has_paid_access_uses_current_period_end():
    now = datetime(2026, 7, 3, tzinfo=timezone.utc)

    assert _has_paid_access({"currentPeriodEnd": now + timedelta(days=1)}, now)
    assert not _has_paid_access({"currentPeriodEnd": now - timedelta(seconds=1)}, now)


def test_pending_subscription_requires_paid_period():
    now = datetime(2026, 7, 3, tzinfo=timezone.utc)

    assert _subscription_has_access(
        {"status": "pending", "planId": "monthly", "currentPeriodEnd": now + timedelta(days=20)},
        now,
    )
    assert not _subscription_has_access(
        {"status": "pending", "planId": "monthly"},
        now,
    )
