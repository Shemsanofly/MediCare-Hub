"""Notification template and delivery log models."""

from __future__ import annotations

import uuid
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from notifications.constants import ALL_CHANNELS


class NotificationTemplate(models.Model):
    """Jinja2 template for a named notification event on a specific channel."""

    class Channel(models.TextChoices):
        EMAIL = 'EMAIL', 'Email'
        SMS = 'SMS', 'SMS'
        WHATSAPP = 'WHATSAPP', 'WhatsApp'
        PUSH = 'PUSH', 'Push (in-app)'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(
        max_length=100,
        db_index=True,
        help_text='Event identifier, e.g. order_placed.',
    )
    channel = models.CharField(max_length=20, choices=Channel.choices, db_index=True)
    subject_template = models.TextField(
        blank=True,
        help_text='Jinja2 template for the subject or title.',
    )
    body_template = models.TextField(help_text='Jinja2 template for the message body.')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'channel']
        constraints = [
            models.UniqueConstraint(
                fields=['name', 'channel'],
                name='unique_notification_template_name_channel',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.name} ({self.channel})'

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': str(self.id),
            'name': self.name,
            'channel': self.channel,
            'is_active': self.is_active,
        }


class NotificationLog(models.Model):
    """Audit record for a single notification dispatch attempt."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        SENT = 'SENT', 'Sent'
        DELIVERED = 'DELIVERED', 'Delivered'
        FAILED = 'FAILED', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notification_logs',
    )
    channel = models.CharField(max_length=20, choices=NotificationTemplate.Channel.choices)
    template = models.ForeignKey(
        NotificationTemplate,
        on_delete=models.PROTECT,
        related_name='logs',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    delivery_confirmed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    select_related_fields: tuple[str, ...] = ('recipient', 'template')
    prefetch_related_fields: tuple[str, ...] = ()

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        recipient = self.recipient.email if self.recipient else 'unknown'
        return f'{self.template.name} → {recipient} [{self.status}]'

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': str(self.id),
            'recipient_id': str(self.recipient_id) if self.recipient_id else None,
            'channel': self.channel,
            'template': self.template.to_dict(),
            'status': self.status,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'delivery_confirmed_at': (
                self.delivery_confirmed_at.isoformat()
                if self.delivery_confirmed_at
                else None
            ),
            'error_message': self.error_message,
        }

    @classmethod
    def valid_channels(cls) -> tuple[str, ...]:
        return ALL_CHANNELS
