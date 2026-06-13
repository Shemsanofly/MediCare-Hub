"""Shared authentication utilities."""

import re
from typing import Any

from django.conf import settings
from django.http import HttpResponse
from rest_framework.request import Request

from authentication.errors import ValidationFailedError

PASSWORD_MIN_LENGTH = 8
PASSWORD_PATTERN = re.compile(
    r'^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\;/`~]).+$'
)


def validate_password_strength(password: str) -> str:
    """
    Validate password meets security requirements.

    Requirements: min 8 chars, uppercase, number, special character.
    """
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValidationFailedError(
            f'Password must be at least {PASSWORD_MIN_LENGTH} characters long.',
            code='PASSWORD_TOO_SHORT',
        )
    if not PASSWORD_PATTERN.match(password):
        raise ValidationFailedError(
            'Password must contain at least one uppercase letter, '
            'one number, and one special character.',
            code='PASSWORD_TOO_WEAK',
        )
    return password


def get_client_ip(request: Request) -> str | None:
    """Extract the client IP address from the request."""
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def get_device_info(request: Request) -> dict[str, Any]:
    """Extract device metadata from the request headers."""
    return {
        'user_agent': request.META.get('HTTP_USER_AGENT', ''),
    }


def set_refresh_token_cookie(response: HttpResponse, refresh_token: str) -> None:
    """Attach the refresh token as an HttpOnly cookie."""
    response.set_cookie(
        key=settings.JWT_REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        httponly=settings.JWT_REFRESH_COOKIE_HTTPONLY,
        secure=settings.JWT_REFRESH_COOKIE_SECURE,
        samesite=settings.JWT_REFRESH_COOKIE_SAMESITE,
        path=settings.JWT_REFRESH_COOKIE_PATH,
    )


def clear_refresh_token_cookie(response: HttpResponse) -> None:
    """Remove the refresh token cookie from the response."""
    response.delete_cookie(
        key=settings.JWT_REFRESH_COOKIE_NAME,
        path=settings.JWT_REFRESH_COOKIE_PATH,
    )


def get_refresh_token_from_request(request: Request) -> str | None:
    """Read the refresh token from the HttpOnly cookie."""
    return request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
