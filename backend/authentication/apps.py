"""Authentication app configuration."""

from django.apps import AppConfig


class AuthenticationConfig(AppConfig):
    """App config for user authentication and RBAC."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'authentication'
    verbose_name = 'Authentication'

    def ready(self) -> None:
        import authentication.signals  # noqa: F401
