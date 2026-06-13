"""Procurement order models."""

import uuid
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from authentication.models import CustomUser, Organisation
from marketplace.models import Product, ProductBatch, Supplier
from orders.constants import DEFAULT_APPROVAL_THRESHOLDS


class Order(models.Model):
    """Hospital procurement order placed with a verified supplier."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        ACCEPTED = 'ACCEPTED', 'Accepted'
        REJECTED = 'REJECTED', 'Rejected'
        APPROVED = 'APPROVED', 'Approved'
        CONFIRMED = 'CONFIRMED', 'Confirmed'
        PAID = 'PAID', 'Paid'
        PREPARING = 'PREPARING', 'Preparing'
        PROCESSING = 'PROCESSING', 'Processing'
        SHIPPED = 'SHIPPED', 'Shipped'
        DELIVERED = 'DELIVERED', 'Delivered'
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED = 'CANCELLED', 'Cancelled'
        DISPUTED = 'DISPUTED', 'Disputed'

    class PaymentTerms(models.TextChoices):
        IMMEDIATE = 'IMMEDIATE', 'Immediate'
        NET30 = 'NET30', 'Net 30'
        NET60 = 'NET60', 'Net 60'
        NET90 = 'NET90', 'Net 90'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='orders_placed',
    )
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.PROTECT,
        related_name='orders',
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='orders',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    delivery_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
    )
    tax_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='TZS')
    lpo_number = models.CharField(
        max_length=100,
        blank=True,
        help_text='Local purchase order reference number.',
    )
    payment_terms = models.CharField(
        max_length=20,
        choices=PaymentTerms.choices,
        default=PaymentTerms.IMMEDIATE,
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    select_related_fields: tuple[str, ...] = (
        'buyer',
        'organisation',
        'supplier',
        'supplier__organisation',
    )
    prefetch_related_fields: tuple[str, ...] = (
        'items',
        'items__product',
        'items__batch',
        'approval_steps',
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organisation', 'status']),
            models.Index(fields=['supplier', 'status']),
            models.Index(fields=['buyer']),
        ]

    def __str__(self) -> str:
        return f'Order {self.id} — {self.status}'

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': str(self.id),
            'buyer_id': str(self.buyer_id),
            'organisation_id': str(self.organisation_id),
            'supplier_id': str(self.supplier_id),
            'status': self.status,
            'subtotal': str(self.subtotal),
            'delivery_fee': str(self.delivery_fee),
            'tax_amount': str(self.tax_amount),
            'total_amount': str(self.total_amount),
            'currency': self.currency,
            'lpo_number': self.lpo_number,
            'payment_terms': self.payment_terms,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
        }

    def save(self, *args, **kwargs) -> None:
        is_new = self._state.adding
        previous_total: Decimal | None = None

        if not is_new and self.pk:
            previous_total = (
                Order.objects.filter(pk=self.pk)
                .values_list('total_amount', flat=True)
                .first()
            )

        super().save(*args, **kwargs)

        if is_new or previous_total != self.total_amount:
            self._ensure_approval_steps()

    def _ensure_approval_steps(self) -> None:
        """Create approval steps when total_amount exceeds configured thresholds."""
        thresholds = getattr(
            settings,
            'ORDER_APPROVAL_THRESHOLDS',
            DEFAULT_APPROVAL_THRESHOLDS,
        )

        for threshold in thresholds:
            threshold_amount = Decimal(str(threshold['threshold_amount']))
            if self.total_amount <= threshold_amount:
                continue

            ApprovalStep.objects.get_or_create(
                order=self,
                step_number=threshold['step_number'],
                defaults={
                    'required_role': threshold['required_role'],
                    'threshold_amount': threshold_amount,
                    'status': ApprovalStep.Status.PENDING,
                },
            )

    @property
    def requires_approval(self) -> bool:
        return self.approval_steps.exists()

    @property
    def all_approvals_complete(self) -> bool:
        steps = self.approval_steps.all()
        if not steps:
            return True
        return not steps.exclude(status=ApprovalStep.Status.APPROVED).exists()


class OrderItem(models.Model):
    """Line item on a procurement order."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='items',
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='order_items',
    )
    batch = models.ForeignKey(
        ProductBatch,
        on_delete=models.PROTECT,
        related_name='order_items',
        null=True,
        blank=True,
    )
    quantity_ordered = models.PositiveIntegerField()
    quantity_delivered = models.PositiveIntegerField(default=0)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ['product__name']

    def __str__(self) -> str:
        return f'{self.product.name} x {self.quantity_ordered}'


class ApprovalStep(models.Model):
    """Multi-level approval step required for high-value orders."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='approval_steps',
    )
    step_number = models.PositiveSmallIntegerField()
    required_role = models.CharField(max_length=50)
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='approval_steps',
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    threshold_amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ['step_number']
        constraints = [
            models.UniqueConstraint(
                fields=['order', 'step_number'],
                name='unique_order_approval_step',
            ),
        ]

    def __str__(self) -> str:
        return f'Order {self.order_id} step {self.step_number} — {self.status}'


class OrderStatusHistory(models.Model):
    """Audit trail of order status transitions."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='status_history',
    )
    from_status = models.CharField(max_length=20)
    to_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='order_status_changes',
        null=True,
        blank=True,
    )
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'order status histories'

    def __str__(self) -> str:
        return f'{self.from_status} → {self.to_status}'


class BatchReservation(models.Model):
    """Tracks stock reserved for an order until completion or release."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='batch_reservations',
    )
    order_item = models.ForeignKey(
        'OrderItem',
        on_delete=models.CASCADE,
        related_name='batch_reservations',
        null=True,
        blank=True,
    )
    batch = models.ForeignKey(
        'marketplace.ProductBatch',
        on_delete=models.PROTECT,
        related_name='reservations',
    )
    quantity = models.PositiveIntegerField()
    is_released = models.BooleanField(default=False)
    is_fulfilled = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['order', 'is_released', 'is_fulfilled']),
        ]

    def __str__(self) -> str:
        return f'Reservation {self.quantity} for order {self.order_id}'


class GoodsReceivedNote(models.Model):
    """Goods received note (GRN) signed when hospital accepts delivery."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='goods_received_notes',
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='goods_received_notes',
    )
    received_at = models.DateTimeField(default=timezone.now)
    items_verified = models.JSONField(
        default=list,
        help_text='Per-item quantity and condition verification details.',
    )
    discrepancies = models.JSONField(default=list, blank=True)
    photos = models.JSONField(
        default=list,
        blank=True,
        help_text='S3 URLs of delivery photos.',
    )
    signature_data = models.TextField(
        blank=True,
        help_text='Base64-encoded signature image data.',
    )
    is_complete = models.BooleanField(default=False)

    class Meta:
        ordering = ['-received_at']

    def __str__(self) -> str:
        return f'GRN {self.id} for order {self.order_id}'
