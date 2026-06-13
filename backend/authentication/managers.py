"""Custom user manager for email-based authentication."""

from typing import Any, Optional

from django.contrib.auth.models import BaseUserManager


class CustomUserManager(BaseUserManager):
    """Manager for CustomUser using email as the login identifier."""

    def create_user(
        self,
        email: str,
        password: Optional[str] = None,
        **extra_fields: Any,
    ) -> 'CustomUser':
        """
        Create and persist a regular user account.

        Args:
            email: Unique email address used for login.
            password: Raw password to hash and store.
            extra_fields: Additional model field values.

        Returns:
            The newly created CustomUser instance.

        Raises:
            ValueError: If email is not provided.
        """
        from authentication.models import CustomUser

        if not email:
            raise ValueError('Email address is required.')
        email = self.normalize_email(email)
        user = CustomUser(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(
        self,
        email: str,
        password: Optional[str] = None,
        **extra_fields: Any,
    ) -> 'CustomUser':
        """
        Create and persist a superuser with admin privileges.

        Args:
            email: Unique email address used for login.
            password: Raw password to hash and store.
            extra_fields: Additional model field values.

        Returns:
            The newly created superuser CustomUser instance.
        """
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'ADMIN')
        extra_fields.setdefault('is_verified', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)

    def get_queryset(self):
        """Default queryset with select_related hints from the model."""
        qs = super().get_queryset()
        select_related = getattr(self.model, 'select_related_fields', ())
        if select_related:
            qs = qs.select_related(*select_related)
        prefetch_related = getattr(self.model, 'prefetch_related_fields', ())
        if prefetch_related:
            qs = qs.prefetch_related(*prefetch_related)
        return qs
