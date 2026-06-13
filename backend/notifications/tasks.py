"""Celery tasks for multi-channel notification delivery."""

from __future__ import annotations

import logging
import uuid

from celery import shared_task

from notifications.constants import NOTIFICATION_RETRY_DELAYS
from notifications.errors import NotificationError
from notifications.models import NotificationLog
from notifications.providers.email import send_email
from notifications.providers.push import send_push
from notifications.providers.sms import send_sms
from notifications.providers.whatsapp import send_whatsapp
from notifications.services import NotificationService

logger = logging.getLogger(__name__)


def _retry_countdown(retries: int) -> int:
    index = min(retries, len(NOTIFICATION_RETRY_DELAYS) - 1)
    return NOTIFICATION_RETRY_DELAYS[index]


def _fetch_log(log_id: str) -> NotificationLog | None:
    try:
        parsed_id = uuid.UUID(str(log_id))
    except ValueError:
        logger.warning('Notification task skipped — invalid log id', extra={'log_id': log_id})
        return None

    try:
        return NotificationLog.objects.select_related('recipient', 'template').get(
            pk=parsed_id,
        )
    except NotificationLog.DoesNotExist:
        logger.warning('Notification task skipped — log not found', extra={'log_id': log_id})
        return None


@shared_task(bind=True, max_retries=3)
def send_email_task(self, log_id: str) -> str:
    """Send an email notification via SendGrid."""
    log = _fetch_log(log_id)
    if log is None:
        return f'notification_{log_id}_invalid'

    if log.status != NotificationLog.Status.PENDING:
        return f'notification_{log_id}_already_processed'

    recipient = log.recipient
    if recipient is None or not recipient.email:
        NotificationService.mark_failed(log, 'Recipient email is missing.')
        return f'notification_{log_id}_missing_email'

    subject = log.metadata.get('subject', '')
    body = log.metadata.get('body', '')

    try:
        response = send_email(
            to_email=recipient.email,
            subject=subject,
            body=body,
            metadata=log.metadata,
        )
        NotificationService.mark_sent(log, provider_response=response)
    except NotificationError as exc:
        logger.warning(
            'Email notification failed',
            extra={'log': log.to_dict(), 'error': exc.message},
        )
        if self.request.retries >= self.max_retries:
            NotificationService.mark_failed(log, exc.message)
            return f'notification_{log_id}_failed'
        raise self.retry(exc=exc, countdown=_retry_countdown(self.request.retries)) from exc
    except Exception as exc:
        logger.exception('Email notification task error', extra={'log_id': log_id})
        if self.request.retries >= self.max_retries:
            NotificationService.mark_failed(log, str(exc))
            return f'notification_{log_id}_failed'
        raise self.retry(exc=exc, countdown=_retry_countdown(self.request.retries)) from exc

    return f'notification_{log_id}_sent'


@shared_task(bind=True, max_retries=3)
def send_sms_task(self, log_id: str) -> str:
    """Send an SMS notification via Africa's Talking."""
    log = _fetch_log(log_id)
    if log is None:
        return f'notification_{log_id}_invalid'

    if log.status != NotificationLog.Status.PENDING:
        return f'notification_{log_id}_already_processed'

    phone = log.metadata.get('phone', '')
    if not phone:
        NotificationService.mark_failed(log, 'Recipient phone is missing from context.')
        return f'notification_{log_id}_missing_phone'

    body = log.metadata.get('body', '')

    try:
        response = send_sms(phone=phone, message=body, metadata=log.metadata)
        NotificationService.mark_sent(log, provider_response=response, delivered=True)
    except NotificationError as exc:
        logger.warning(
            'SMS notification failed',
            extra={'log': log.to_dict(), 'error': exc.message},
        )
        if self.request.retries >= self.max_retries:
            NotificationService.mark_failed(log, exc.message)
            return f'notification_{log_id}_failed'
        raise self.retry(exc=exc, countdown=_retry_countdown(self.request.retries)) from exc
    except Exception as exc:
        logger.exception('SMS notification task error', extra={'log_id': log_id})
        if self.request.retries >= self.max_retries:
            NotificationService.mark_failed(log, str(exc))
            return f'notification_{log_id}_failed'
        raise self.retry(exc=exc, countdown=_retry_countdown(self.request.retries)) from exc

    return f'notification_{log_id}_sent'


@shared_task(bind=True, max_retries=3)
def send_whatsapp_task(self, log_id: str) -> str:
    """Send a WhatsApp notification via the WhatsApp Business API."""
    log = _fetch_log(log_id)
    if log is None:
        return f'notification_{log_id}_invalid'

    if log.status != NotificationLog.Status.PENDING:
        return f'notification_{log_id}_already_processed'

    phone = log.metadata.get('phone', '')
    if not phone:
        NotificationService.mark_failed(log, 'Recipient phone is missing from context.')
        return f'notification_{log_id}_missing_phone'

    body = log.metadata.get('body', '')

    try:
        response = send_whatsapp(phone=phone, message=body, metadata=log.metadata)
        NotificationService.mark_sent(log, provider_response=response, delivered=True)
    except NotificationError as exc:
        logger.warning(
            'WhatsApp notification failed',
            extra={'log': log.to_dict(), 'error': exc.message},
        )
        if self.request.retries >= self.max_retries:
            NotificationService.mark_failed(log, exc.message)
            return f'notification_{log_id}_failed'
        raise self.retry(exc=exc, countdown=_retry_countdown(self.request.retries)) from exc
    except Exception as exc:
        logger.exception('WhatsApp notification task error', extra={'log_id': log_id})
        if self.request.retries >= self.max_retries:
            NotificationService.mark_failed(log, str(exc))
            return f'notification_{log_id}_failed'
        raise self.retry(exc=exc, countdown=_retry_countdown(self.request.retries)) from exc

    return f'notification_{log_id}_sent'


@shared_task(bind=True, max_retries=3)
def send_push_task(self, log_id: str) -> str:
    """Send an in-app push notification via Django Channels WebSocket."""
    log = _fetch_log(log_id)
    if log is None:
        return f'notification_{log_id}_invalid'

    if log.status != NotificationLog.Status.PENDING:
        return f'notification_{log_id}_already_processed'

    recipient = log.recipient
    if recipient is None:
        NotificationService.mark_failed(log, 'Recipient is missing.')
        return f'notification_{log_id}_missing_recipient'

    subject = log.metadata.get('subject', '')
    body = log.metadata.get('body', '')

    try:
        response = send_push(
            user_id=str(recipient.id),
            subject=subject,
            body=body,
            metadata=log.metadata,
        )
        NotificationService.mark_sent(log, provider_response=response, delivered=True)
    except NotificationError as exc:
        logger.warning(
            'Push notification failed',
            extra={'log': log.to_dict(), 'error': exc.message},
        )
        if self.request.retries >= self.max_retries:
            NotificationService.mark_failed(log, exc.message)
            return f'notification_{log_id}_failed'
        raise self.retry(exc=exc, countdown=_retry_countdown(self.request.retries)) from exc
    except Exception as exc:
        logger.exception('Push notification task error', extra={'log_id': log_id})
        if self.request.retries >= self.max_retries:
            NotificationService.mark_failed(log, str(exc))
            return f'notification_{log_id}_failed'
        raise self.retry(exc=exc, countdown=_retry_countdown(self.request.retries)) from exc

    return f'notification_{log_id}_sent'
