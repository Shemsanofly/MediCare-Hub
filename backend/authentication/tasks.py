"""Celery tasks for the authentication app."""

import logging
import uuid

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_verification_email(self, user_id: str, token: str) -> str:
    """
    Send an email verification link to a newly registered user.

    Args:
        user_id: Primary key of the CustomUser to notify.
        token: Email verification token value.

    Returns:
        Status message describing the outcome.
    """
    from authentication.models import CustomUser

    try:
        parsed_id = uuid.UUID(str(user_id))
    except ValueError:
        logger.warning(
            'Verification email skipped — invalid user id',
            extra={'user_id': user_id},
        )
        return f'user_{user_id}_invalid_id'

    try:
        user = CustomUser.objects.get(pk=parsed_id)
    except CustomUser.DoesNotExist:
        logger.warning(
            'Verification email skipped — user not found',
            extra={'user_id': user_id},
        )
        return f'user_{user_id}_not_found'

    if not user.is_active:
        logger.info(
            'Verification email skipped — user inactive',
            extra={'user_id': user_id},
        )
        return f'user_{user_id}_inactive'

    verify_url = f'{settings.FRONTEND_URL}/verify-email/{token}'
    subject = 'Verify your MediCare Hub account'
    message = (
        f'Hello {user.first_name or user.email},\n\n'
        f'Please verify your email address by visiting:\n{verify_url}\n\n'
        f'This link expires in 24 hours.\n\n'
        f'— MediCare Hub'
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )

    logger.info(
        'Verification email sent',
        extra={'user': user.to_dict()},
    )
    return f'verification_email_sent_{user_id}'


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset_email(self, user_id: str, token: str) -> str:
    """
    Send a password reset link to the user.

    Args:
        user_id: Primary key of the CustomUser to notify.
        token: Password reset token value.

    Returns:
        Status message describing the outcome.
    """
    from authentication.models import CustomUser

    try:
        parsed_id = uuid.UUID(str(user_id))
    except ValueError:
        logger.warning(
            'Password reset email skipped — invalid user id',
            extra={'user_id': user_id},
        )
        return f'user_{user_id}_invalid_id'

    try:
        user = CustomUser.objects.get(pk=parsed_id)
    except CustomUser.DoesNotExist:
        logger.warning(
            'Password reset email skipped — user not found',
            extra={'user_id': user_id},
        )
        return f'user_{user_id}_not_found'

    reset_url = f'{settings.FRONTEND_URL}/password-reset/{token}'
    subject = 'Reset your MediCare Hub password'
    message = (
        f'Hello {user.first_name or user.email},\n\n'
        f'Reset your password by visiting:\n{reset_url}\n\n'
        f'This link expires in 1 hour.\n\n'
        f'If you did not request this, please ignore this email.\n\n'
        f'— MediCare Hub'
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )

    logger.info(
        'Password reset email sent',
        extra={'user': user.to_dict()},
    )
    return f'password_reset_email_sent_{user_id}'


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_welcome_email(self, user_id: str) -> str:
    """
    Send a welcome email to a newly registered user.

    Idempotent: skips sending if the user no longer exists or is inactive.
    """
    from authentication.models import CustomUser

    try:
        parsed_id = uuid.UUID(str(user_id))
    except ValueError:
        logger.warning(
            'Welcome email skipped — invalid user id',
            extra={'user_id': user_id},
        )
        return f'user_{user_id}_invalid_id'

    try:
        user = CustomUser.objects.get(pk=parsed_id)
    except CustomUser.DoesNotExist:
        logger.warning(
            'Welcome email skipped — user not found',
            extra={'user_id': user_id},
        )
        return f'user_{user_id}_not_found'

    if not user.is_active:
        logger.info(
            'Welcome email skipped — user inactive',
            extra={'user_id': user_id},
        )
        return f'user_{user_id}_inactive'

    logger.info(
        'Welcome email queued',
        extra={'user': user.to_dict()},
    )
    return f'welcome_email_sent_{user_id}'
