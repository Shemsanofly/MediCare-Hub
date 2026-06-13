"""Notification channel and event constants."""

from __future__ import annotations

CHANNEL_EMAIL = 'EMAIL'
CHANNEL_SMS = 'SMS'
CHANNEL_WHATSAPP = 'WHATSAPP'
CHANNEL_PUSH = 'PUSH'

ALL_CHANNELS: tuple[str, ...] = (
    CHANNEL_EMAIL,
    CHANNEL_SMS,
    CHANNEL_WHATSAPP,
    CHANNEL_PUSH,
)

STANDARD_NOTIFICATION_EVENTS: tuple[str, ...] = (
    'order_placed',
    'order_approved',
    'order_confirmed',
    'payment_received',
    'order_shipped',
    'order_delivered',
    'stock_low',
    'expiry_alert',
    'supplier_verified',
)

# Exponential backoff countdowns (seconds) for Celery retries.
NOTIFICATION_RETRY_DELAYS: tuple[int, ...] = (60, 300, 900)
