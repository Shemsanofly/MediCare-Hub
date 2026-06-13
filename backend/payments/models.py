"""Payment, webhook, and escrow models."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from django.db import models
from django.utils import timezone

from orders.models import Order


class Payment(models.Model):
    """Payment record linked to a procurement order."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        PROCESSING = 'PROCESSING', 'Processing'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'
        REFUNDED = 'REFUNDED', 'Refunded'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order,
        on_delete=models.PROTECT,
        related_name='payments',
    )
    gateway = models.CharField(max_length=20, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='TZS')
    transaction_reference = models.CharField(max_length=100, unique=True, db_index=True)
    gateway_reference = models.CharField(max_length=255, blank=True, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    gateway_response = models.JSONField(default=dict, blank=True)
    initiated_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-initiated_at']
        indexes = [
            models.Index(fields=['order', 'status']),
            models.Index(fields=['gateway', 'gateway_reference']),
        ]

    def __str__(self) -> str:
        return f'Payment {self.id} — {self.status}'

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': str(self.id),
            'order_id': str(self.order_id),
            'gateway': self.gateway,
            'amount': str(self.amount),
            'currency': self.currency,
            'transaction_reference': self.transaction_reference,
            'gateway_reference': self.gateway_reference,
            'status': self.status,
            'initiated_at': self.initiated_at.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }


class WebhookLog(models.Model):
    """Raw webhook payload log for debugging and replay."""

    class ProcessingStatus(models.TextChoices):
        RECEIVED = 'RECEIVED', 'Received'
        VERIFIED = 'VERIFIED', 'Verified'
        PROCESSED = 'PROCESSED', 'Processed'
        FAILED = 'FAILED', 'Failed'
        REJECTED = 'REJECTED', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    gateway = models.CharField(max_length=20, db_index=True)
    raw_payload = models.JSONField()
    headers = models.JSONField(default=dict, blank=True)
    signature = models.CharField(max_length=512, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    signature_verified = models.BooleanField(default=False)
    processing_status = models.CharField(
        max_length=20,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.RECEIVED,
    )
    processing_error = models.TextField(blank=True)
    payment = models.ForeignKey(
        Payment,
        on_delete=models.SET_NULL,
        related_name='webhook_logs',
        null=True,
        blank=True,
    )
    received_at = models.DateTimeField(default=timezone.now)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-received_at']
        indexes = [
            models.Index(fields=['gateway', 'processing_status']),
        ]

    def __str__(self) -> str:
        return f'Webhook {self.gateway} — {self.processing_status}'


class EscrowAccount(models.Model):
    """Escrow holding funds until GRN confirmation or auto-release."""

    class Status(models.TextChoices):
        HOLDING = 'HOLDING', 'Holding'
        RELEASED = 'RELEASED', 'Released'
        REFUNDED = 'REFUNDED', 'Refunded'
        FROZEN = 'FROZEN', 'Frozen'

    class ReleaseTrigger(models.TextChoices):
        GRN_SIGNED = 'GRN_SIGNED', 'GRN Signed'
        AUTO_RELEASE = 'AUTO_RELEASE', 'Auto Release (72h)'
        ADMIN = 'ADMIN', 'Admin Resolution'
        DISPUTE = 'DISPUTE', 'Dispute'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.OneToOneField(
        Order,
        on_delete=models.PROTECT,
        related_name='escrow_account',
    )
    payment = models.OneToOneField(
        Payment,
        on_delete=models.PROTECT,
        related_name='escrow_account',
    )
    amount_held = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.HOLDING,
        db_index=True,
    )
    held_at = models.DateTimeField(default=timezone.now)
    release_trigger = models.CharField(
        max_length=20,
        choices=ReleaseTrigger.choices,
        blank=True,
    )
    released_at = models.DateTimeField(null=True, blank=True)
    dispute_reason = models.TextField(blank=True)

    class Meta:
        ordering = ['-held_at']

    def __str__(self) -> str:
        return f'Escrow {self.id} — {self.status}'


class PayoutTransaction(models.Model):
    """Supplier payout created when escrow funds are released."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    escrow_account = models.ForeignKey(
        EscrowAccount,
        on_delete=models.PROTECT,
        related_name='payouts',
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.PROTECT,
        related_name='payouts',
    )
    supplier = models.ForeignKey(
        'marketplace.Supplier',
        on_delete=models.PROTECT,
        related_name='payouts',
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='TZS')
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    gateway_reference = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'Payout {self.id} — {self.status}'
