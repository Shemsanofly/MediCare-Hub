"""Notifications app configuration."""

from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    """App config for email, SMS, and in-app notifications."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'notifications'
    verbose_name = 'Notifications'
