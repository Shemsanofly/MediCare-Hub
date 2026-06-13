"""In-app push notifications via Django Channels WebSocket."""

from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from notifications.errors import NotificationError

logger = logging.getLogger(__name__)


def send_push(
    *,
    user_id: str,
    subject: str,
    body: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Push a notification to the user's WebSocket group."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        raise NotificationError(
            'Channel layer is not configured.',
            code='CHANNEL_LAYER_NOT_CONFIGURED',
        )

    payload = {
        'subject': subject,
        'body': body,
        'metadata': metadata or {},
    }

    async_to_sync(channel_layer.group_send)(
        f'notifications_user_{user_id}',
        {
            'type': 'notification.message',
            'payload': payload,
        },
    )

    logger.info(
        'In-app notification pushed',
        extra={'user_id': user_id, 'subject': subject},
    )

    return {
        'provider': 'django_channels',
        'user_id': user_id,
        'payload': payload,
    }
