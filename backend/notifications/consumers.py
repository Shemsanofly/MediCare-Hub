"""WebSocket consumers for real-time in-app notifications."""

from __future__ import annotations

import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """Stream in-app notifications to authenticated users."""

    async def connect(self) -> None:
        user = self.scope.get('user')
        if user is None or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.user = user
        self.group_name = f'notifications_user_{user.id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info('Notification WebSocket connected', extra={'user_id': str(user.id)})

    async def disconnect(self, close_code: int) -> None:
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notification_message(self, event: dict) -> None:
        """Handle messages pushed by the channel layer."""
        payload = event.get('payload', {})
        await self.send_json({
            'type': 'notification',
            'subject': payload.get('subject', ''),
            'body': payload.get('body', ''),
            'metadata': payload.get('metadata', {}),
        })
