"""SendGrid email delivery."""

from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings

from notifications.errors import NotificationError

logger = logging.getLogger(__name__)

SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'


def send_email(
    *,
    to_email: str,
    subject: str,
    body: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Send an email via SendGrid."""
    api_key = settings.SENDGRID_API_KEY
    if not api_key:
        raise NotificationError(
            'SendGrid API key is not configured.',
            code='SENDGRID_NOT_CONFIGURED',
        )

    payload = {
        'personalizations': [{'to': [{'email': to_email}]}],
        'from': {'email': settings.DEFAULT_FROM_EMAIL},
        'subject': subject,
        'content': [{'type': 'text/plain', 'value': body}],
    }

    response = requests.post(
        SENDGRID_API_URL,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        json=payload,
        timeout=30,
    )

    if response.status_code >= 400:
        logger.error(
            'SendGrid request failed',
            extra={
                'status_code': response.status_code,
                'response': response.text[:500],
                'to_email': to_email,
            },
        )
        raise NotificationError(
            f'SendGrid returned HTTP {response.status_code}.',
            code='SENDGRID_API_ERROR',
        )

    return {
        'provider': 'sendgrid',
        'status_code': response.status_code,
        'metadata': metadata or {},
    }
