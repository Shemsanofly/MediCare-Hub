"""Unified notification orchestration service."""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from jinja2 import Environment, TemplateError, select_autoescape

from authentication.models import CustomUser
from notifications.constants import ALL_CHANNELS
from notifications.errors import NotificationError
from notifications.models import NotificationLog, NotificationTemplate

logger = logging.getLogger(__name__)

_jinja_env = Environment(
    autoescape=select_autoescape(default_for_string=True, default=True),
)

_CHANNEL_TASKS: dict[str, str] = {
    NotificationTemplate.Channel.EMAIL: 'notifications.tasks.send_email_task',
    NotificationTemplate.Channel.SMS: 'notifications.tasks.send_sms_task',
    NotificationTemplate.Channel.WHATSAPP: 'notifications.tasks.send_whatsapp_task',
    NotificationTemplate.Channel.PUSH: 'notifications.tasks.send_push_task',
}


class NotificationService:
    """Resolve templates, render content, and dispatch notifications per channel."""

    @classmethod
    def send(
        cls,
        user: CustomUser,
        template_name: str,
        context: dict[str, Any] | None = None,
        channels: list[str] | None = None,
    ) -> list[NotificationLog]:
        """
        Send a notification to a user across one or more channels.

        Args:
            user: Recipient user.
            template_name: Event identifier matching NotificationTemplate.name.
            context: Jinja2 template variables.
            channels: Optional channel filter; defaults to all active templates
                for the event.

        Returns:
            List of created NotificationLog records.
        """
        render_context = cls._build_context(user, context)
        target_channels = channels or list(ALL_CHANNELS)

        templates = NotificationTemplate.objects.filter(
            name=template_name,
            channel__in=target_channels,
            is_active=True,
        )
        if not templates.exists():
            raise NotificationError(
                f'No active templates found for event "{template_name}".',
                code='TEMPLATE_NOT_FOUND',
            )

        logs: list[NotificationLog] = []
        with transaction.atomic():
            for template in templates:
                subject, body = cls._render_template(template, render_context)
                log = NotificationLog.objects.create(
                    recipient=user,
                    channel=template.channel,
                    template=template,
                    status=NotificationLog.Status.PENDING,
                    metadata={
                        'event': template_name,
                        'subject': subject,
                        'body': body,
                        'context': render_context,
                        'phone': render_context.get('phone', ''),
                    },
                )
                logs.append(log)

            transaction.on_commit(
                lambda created_logs=list(logs): cls._dispatch_logs(created_logs)
            )

        logger.info(
            'Notifications queued',
            extra={
                'user': user.to_dict(),
                'template_name': template_name,
                'channels': [log.channel for log in logs],
            },
        )
        return logs

    @classmethod
    def _build_context(
        cls,
        user: CustomUser,
        context: dict[str, Any] | None,
    ) -> dict[str, Any]:
        base = {
            'user': user,
            'user_id': str(user.id),
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'full_name': user.full_name,
        }
        if context:
            base.update(context)
        return base

    @classmethod
    def _render_template(
        cls,
        template: NotificationTemplate,
        context: dict[str, Any],
    ) -> tuple[str, str]:
        try:
            subject = (
                _jinja_env.from_string(template.subject_template).render(**context)
                if template.subject_template
                else ''
            )
            body = _jinja_env.from_string(template.body_template).render(**context)
        except TemplateError as exc:
            raise NotificationError(
                f'Template render failed for {template.name} ({template.channel}): {exc}',
                code='TEMPLATE_RENDER_ERROR',
            ) from exc
        return subject.strip(), body.strip()

    @classmethod
    def _dispatch_logs(cls, logs: list[NotificationLog]) -> None:
        from celery import current_app

        for log in logs:
            task_path = _CHANNEL_TASKS.get(log.channel)
            if not task_path:
                logger.warning(
                    'No task registered for channel',
                    extra={'channel': log.channel, 'log_id': str(log.id)},
                )
                continue
            current_app.send_task(task_path, args=[str(log.id)])

    @classmethod
    def mark_sent(
        cls,
        log: NotificationLog,
        *,
        provider_response: dict[str, Any] | None = None,
        delivered: bool = False,
    ) -> None:
        """Update a log after successful provider delivery."""
        from django.utils import timezone

        now = timezone.now()
        log.status = (
            NotificationLog.Status.DELIVERED
            if delivered
            else NotificationLog.Status.SENT
        )
        log.sent_at = now
        if delivered:
            log.delivery_confirmed_at = now
        if provider_response:
            log.metadata = {**log.metadata, 'provider_response': provider_response}
        log.save(
            update_fields=[
                'status',
                'sent_at',
                'delivery_confirmed_at',
                'metadata',
            ],
        )

    @classmethod
    def mark_failed(cls, log: NotificationLog, error_message: str) -> None:
        """Update a log after a permanent or retried failure."""
        log.status = NotificationLog.Status.FAILED
        log.error_message = error_message[:2000]
        log.save(update_fields=['status', 'error_message'])
