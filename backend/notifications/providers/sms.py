"""Africa's Talking SMS delivery (Tanzania)."""

from __future__ import annotations

import logging
import re
from typing import Any

import requests
from django.conf import settings

from notifications.errors import NotificationError

logger = logging.getLogger(__name__)

TZ_PHONE_PATTERN = re.compile(r'^255\d{9}$')
AFRICAS_TALKING_SMS_URL = 'https://api.africastalking.com/version1/messaging'


def normalize_phone(phone: str) -> str:
    """Normalize a phone number to 255XXXXXXXXX format."""
    digits = re.sub(r'\D', '', phone)
    if digits.startswith('0'):
        digits = f'255{digits[1:]}'
    elif not digits.startswith('255'):
        digits = f'255{digits}'

    if not TZ_PHONE_PATTERN.match(digits):
        raise NotificationError(
            'Phone must be a valid Tanzania number (255XXXXXXXXX).',
            code='INVALID_PHONE',
        )
    return digits


def send_sms(
    *,
    phone: str,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Send an SMS via Africa's Talking."""
    api_key = settings.AFRICAS_TALKING_API_KEY
    username = settings.AFRICAS_TALKING_USERNAME
    if not api_key or not username:
        raise NotificationError(
            "Africa's Talking credentials are not configured.",
            code='AFRICAS_TALKING_NOT_CONFIGURED',
        )

    normalized_phone = normalize_phone(phone)
    payload = {
        'username': username,
        'to': normalized_phone,
        'message': message,
    }
    if settings.AFRICAS_TALKING_SHORTCODE:
        payload['from'] = settings.AFRICAS_TALKING_SHORTCODE

    response = requests.post(
        AFRICAS_TALKING_SMS_URL,
        headers={
            'apiKey': api_key,
            'Accept': 'application/json',
        },
        data=payload,
        timeout=30,
    )

    if response.status_code >= 400:
        logger.error(
            "Africa's Talking request failed",
            extra={
                'status_code': response.status_code,
                'response': response.text[:500],
                'phone': normalized_phone,
            },
        )
        raise NotificationError(
            f"Africa's Talking returned HTTP {response.status_code}.",
            code='AFRICAS_TALKING_API_ERROR',
        )

    response_data = response.json()
    recipients = response_data.get('SMSMessageData', {}).get('Recipients', [])
    if recipients and recipients[0].get('status') == 'Failed':
        raise NotificationError(
            recipients[0].get('statusMessage', 'SMS delivery failed.'),
            code='AFRICAS_TALKING_DELIVERY_FAILED',
        )

    return {
        'provider': 'africas_talking',
        'status_code': response.status_code,
        'response': response_data,
        'metadata': metadata or {},
    }
