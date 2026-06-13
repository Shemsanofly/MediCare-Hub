"""Authentication business logic and audit services."""

import logging
import secrets
from datetime import timedelta
from typing import Any

from django.utils import timezone
from rest_framework.request import Request
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from authentication.models import AuditLog, AuthToken, CustomUser, UserSession
from authentication.utils import get_client_ip, get_device_info

logger = logging.getLogger(__name__)

EMAIL_VERIFICATION_LIFETIME = timedelta(hours=24)
PASSWORD_RESET_LIFETIME = timedelta(hours=1)


def create_audit_log(
    action: str,
    request: Request,
    user: CustomUser | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    """Persist an audit log entry and emit a structured log message."""
    ip_address = get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    audit_entry = AuditLog.objects.create(
        action=action,
        user=user,
        ip_address=ip_address,
        user_agent=user_agent,
        metadata=metadata or {},
    )
    logger.info(
        action,
        extra={
            'audit': audit_entry.to_dict(),
            'user': user.to_dict() if user else None,
            'ip_address': ip_address,
        },
    )
    return audit_entry


def create_auth_token(
    user: CustomUser,
    token_type: str,
    lifetime: timedelta,
) -> AuthToken:
    """Create a new time-limited authentication token."""
    AuthToken.objects.filter(
        user=user,
        token_type=token_type,
        used_at__isnull=True,
    ).update(used_at=timezone.now())

    return AuthToken.objects.create(
        user=user,
        token=secrets.token_urlsafe(32),
        token_type=token_type,
        expires_at=timezone.now() + lifetime,
    )


def get_valid_auth_token(token: str, token_type: str) -> AuthToken | None:
    """Return a valid, unused auth token or None."""
    try:
        auth_token = AuthToken.objects.select_related('user').get(
            token=token,
            token_type=token_type,
        )
    except AuthToken.DoesNotExist:
        return None

    if not auth_token.is_valid:
        return None
    return auth_token


def invalidate_all_user_sessions(user: CustomUser) -> int:
    """
    Blacklist all outstanding refresh tokens and delete session records.

    Returns the number of sessions invalidated.
    """
    outstanding_tokens = OutstandingToken.objects.filter(user_id=user.pk)
    for outstanding in outstanding_tokens:
        BlacklistedToken.objects.get_or_create(token=outstanding)

    deleted_count, _ = UserSession.objects.filter(user=user).delete()
    return deleted_count


def blacklist_refresh_token(refresh_token_str: str) -> bool:
    """Blacklist a single refresh token. Returns False if token is invalid."""
    try:
        token = RefreshToken(refresh_token_str)
        token.blacklist()
    except Exception:
        return False
    return True
