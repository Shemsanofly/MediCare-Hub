"""WhatsApp Business API delivery."""

from __future__ import annotations

import logging
from typing import Any

import requests
from django.conf import settings

from notifications.errors import NotificationError
from notifications.providers.sms import normalize_phone

logger = logging.getLogger(__name__)


def send_whatsapp(
    *,
    phone: str,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Send a WhatsApp text message via the Meta Business API."""
    api_token = settings.WHATSAPP_API_TOKEN
    phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
    if not api_token or not phone_number_id:
        raise NotificationError(
            'WhatsApp Business API credentials are not configured.',
            code='WHATSAPP_NOT_CONFIGURED',
        )

    normalized_phone = normalize_phone(phone)
    url = (
        f'https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}'
        f'/{phone_number_id}/messages'
    )
    payload = {
        'messaging_product': 'whatsapp',
        'to': normalized_phone,
        'type': 'text',
        'text': {'body': message},
    }

    response = requests.post(
        url,
        headers={
            'Authorization': f'Bearer {api_token}',
            'Content-Type': 'application/json',
        },
        json=payload,
        timeout=30,
    )

    if response.status_code >= 400:
        logger.error(
            'WhatsApp API request failed',
            extra={
                'status_code': response.status_code,
                'response': response.text[:500],
                'phone': normalized_phone,
            },
        )
        raise NotificationError(
            f'WhatsApp API returned HTTP {response.status_code}.',
            code='WHATSAPP_API_ERROR',
        )

    response_data = response.json()
    return {
        'provider': 'whatsapp_business',
        'status_code': response.status_code,
        'response': response_data,
        'metadata': metadata or {},
    }
