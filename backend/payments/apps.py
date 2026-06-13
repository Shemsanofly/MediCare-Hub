"""Payments app configuration."""

from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    """App config for payment processing and invoicing."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'payments'
    verbose_name = 'Payments'

    def ready(self) -> None:
        import payments.signals  # noqa: F401
