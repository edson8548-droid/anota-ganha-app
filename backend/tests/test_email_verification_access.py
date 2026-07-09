import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.email_verification_access import should_block_unverified_email


def test_does_not_block_existing_users_without_required_flag():
    assert not should_block_unverified_email({}, {"email_verified": False})


def test_does_not_block_required_user_when_email_is_not_verified():
    user_data = {"requiresEmailVerification": True}
    decoded = {"email_verified": False}

    assert not should_block_unverified_email(user_data, decoded)


def test_allows_required_user_after_email_verification():
    user_data = {"requiresEmailVerification": True}
    decoded = {"email_verified": True}

    assert not should_block_unverified_email(user_data, decoded)
