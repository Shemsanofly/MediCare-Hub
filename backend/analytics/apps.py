"""Analytics app configuration."""

from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    """App config for platform metrics and reporting."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'analytics'
    verbose_name = 'Analytics'
