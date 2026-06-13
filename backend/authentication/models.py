"""Authentication models for MediCare Hub."""

import uuid
from decimal import Decimal
from typing import Any

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from authentication.managers import CustomUserManager


class Organisation(models.Model):
    """Healthcare or supply organisation registered on the platform."""

    class Type(models.TextChoices):
        HOSPITAL = 'HOSPITAL', 'Hospital'
        SUPPLIER = 'SUPPLIER', 'Supplier'
        PHARMACY = 'PHARMACY', 'Pharmacy'
        LAB = 'LAB', 'Laboratory'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=Type.choices, db_index=True)
    registration_number = models.CharField(max_length=100, blank=True)
    tmda_license = models.CharField(max_length=100, blank=True)
    is_verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    select_related_fields: tuple[str, ...] = ()
    prefetch_related_fields: tuple[str, ...] = ()

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return self.name

    def to_dict(self) -> dict[str, Any]:
        """Return a logging-safe representation without sensitive data."""
        return {
            'id': str(self.id),
            'name': self.name,
            'type': self.type,
            'registration_number': self.registration_number,
            'tmda_license': self.tmda_license,
            'is_verified': self.is_verified,
            'verified_at': self.verified_at.isoformat() if self.verified_at else None,
            'created_at': self.created_at.isoformat(),
        }


class CustomUser(AbstractBaseUser, PermissionsMixin):
    """
    Custom user model using email as the unique login identifier.

    Supports role-based access control for Hospital, Supplier, and Admin users.
    """

    class Role(models.TextChoices):
        HOSPITAL = 'HOSPITAL', 'Hospital'
        SUPPLIER = 'SUPPLIER', 'Supplier'
        ADMIN = 'ADMIN', 'Admin'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.HOSPITAL,
        db_index=True,
    )
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.PROTECT,
        related_name='users',
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    is_verified = models.BooleanField(default=False)
    is_staff = models.BooleanField(
        default=False,
        help_text='Designates whether the user can access the Django admin site.',
    )
    mfa_enabled = models.BooleanField(default=False)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS: list[str] = []

    select_related_fields: tuple[str, ...] = ('organisation',)
    prefetch_related_fields: tuple[str, ...] = ()

    class Meta:
        verbose_name = 'user'
        verbose_name_plural = 'users'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.email

    @property
    def full_name(self) -> str:
        """Return the user's full name or email if names are unset."""
        name = f'{self.first_name} {self.last_name}'.strip()
        return name or self.email

    def to_dict(self) -> dict[str, Any]:
        """Return a logging-safe representation without sensitive data."""
        return {
            'id': str(self.id),
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'role': self.role,
            'organisation_id': str(self.organisation_id) if self.organisation_id else None,
            'is_active': self.is_active,
            'is_verified': self.is_verified,
            'mfa_enabled': self.mfa_enabled,
            'last_login_ip': self.last_login_ip,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
        }

    def can_approve_procurement(self, amount: Decimal) -> bool:
        """Return whether this user may approve a procurement order amount."""
        if self.role == self.Role.ADMIN:
            return True
        if self.role != self.Role.HOSPITAL or not self.is_verified:
            return False
        if self.organisation and not self.organisation.is_verified:
            return False
        default_limit = Decimal('5000000')
        return amount <= default_limit


class UserSession(models.Model):
    """Tracks authenticated user sessions for audit and revocation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='sessions',
    )
    session_token = models.CharField(max_length=255, unique=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    device_info = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()

    select_related_fields: tuple[str, ...] = ('user', 'user__organisation')
    prefetch_related_fields: tuple[str, ...] = ()

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'Session {self.id} for {self.user.email}'

    def to_dict(self) -> dict[str, Any]:
        """Return a logging-safe representation without tokens."""
        return {
            'id': str(self.id),
            'user_id': str(self.user_id),
            'ip_address': self.ip_address,
            'device_info': self.device_info,
            'created_at': self.created_at.isoformat(),
            'expires_at': self.expires_at.isoformat(),
        }


class AuthToken(models.Model):
    """Time-limited tokens for email verification and password reset."""

    class Type(models.TextChoices):
        EMAIL_VERIFICATION = 'EMAIL_VERIFICATION', 'Email Verification'
        PASSWORD_RESET = 'PASSWORD_RESET', 'Password Reset'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='auth_tokens',
    )
    token = models.CharField(max_length=255, unique=True, db_index=True)
    token_type = models.CharField(max_length=30, choices=Type.choices, db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'token_type', 'expires_at']),
        ]

    def __str__(self) -> str:
        return f'{self.token_type} token for {self.user.email}'

    @property
    def is_valid(self) -> bool:
        """Return whether the token is unused and not expired."""
        return self.used_at is None and self.expires_at > timezone.now()

    def to_dict(self) -> dict[str, Any]:
        """Return a logging-safe representation without the token value."""
        return {
            'id': str(self.id),
            'user_id': str(self.user_id),
            'token_type': self.token_type,
            'created_at': self.created_at.isoformat(),
            'expires_at': self.expires_at.isoformat(),
            'used_at': self.used_at.isoformat() if self.used_at else None,
        }


class AuditLog(models.Model):
    """Persistent audit trail for authentication and security events."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    action = models.CharField(max_length=100, db_index=True)
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        related_name='audit_logs',
        null=True,
        blank=True,
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        actor = self.user.email if self.user else 'anonymous'
        return f'{self.action} by {actor} at {self.created_at}'

    def to_dict(self) -> dict[str, Any]:
        """Return a logging-safe representation."""
        return {
            'id': str(self.id),
            'action': self.action,
            'user_id': str(self.user_id) if self.user_id else None,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'metadata': self.metadata,
            'created_at': self.created_at.isoformat(),
        }
