"""Marketplace models for product catalog and supplier verification."""

import uuid
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from authentication.models import Organisation


class Category(models.Model):
    """Product category with optional parent for subcategories."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        related_name='subcategories',
        null=True,
        blank=True,
    )
    is_regulated = models.BooleanField(default=False)
    tmda_required = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = 'categories'
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class Supplier(models.Model):
    """Verified pharmaceutical supplier linked to an organisation."""

    class VerificationStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        VERIFIED = 'VERIFIED', 'Verified'
        REJECTED = 'REJECTED', 'Rejected'
        SUSPENDED = 'SUSPENDED', 'Suspended'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.OneToOneField(
        Organisation,
        on_delete=models.CASCADE,
        related_name='supplier_profile',
    )
    brela_registration_number = models.CharField(max_length=20, blank=True)
    tmda_license_number = models.CharField(max_length=100, blank=True)
    license_expiry_date = models.DateField(null=True, blank=True)
    trust_score = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    average_delivery_days = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('7.00'),
        help_text='Rolling average delivery time in days.',
    )
    is_cold_chain_certified = models.BooleanField(default=False)
    cold_chain_cert_expiry = models.DateField(null=True, blank=True)
    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING,
        db_index=True,
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='verified_suppliers',
        null=True,
        blank=True,
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    suspension_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['organisation__name']

    def __str__(self) -> str:
        return self.organisation.name

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': str(self.id),
            'organisation_id': str(self.organisation_id),
            'brela_registration_number': self.brela_registration_number,
            'tmda_license_number': self.tmda_license_number,
            'verification_status': self.verification_status,
            'trust_score': self.trust_score,
        }


class SupplierDocument(models.Model):
    """Verification documents uploaded by suppliers."""

    class DocumentType(models.TextChoices):
        BUSINESS_CERT = 'business_cert', 'Business Certificate'
        TMDA_LICENSE = 'tmda_license', 'TMDA License'
        TAX_CLEARANCE = 'tax_clearance', 'Tax Clearance'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name='documents',
    )
    document_type = models.CharField(max_length=30, choices=DocumentType.choices)
    file = models.FileField(upload_to='supplier_documents/%Y/%m/')
    uploaded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-uploaded_at']
        constraints = [
            models.UniqueConstraint(
                fields=['supplier', 'document_type'],
                name='unique_supplier_document_type',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.supplier} — {self.document_type}'


class Product(models.Model):
    """Marketplace product listing from a verified supplier."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name='products',
        db_index=True,
    )
    name = models.CharField(max_length=255)
    generic_name = models.CharField(
        max_length=255,
        blank=True,
        help_text='International Nonproprietary Name (INN).',
    )
    gtin = models.CharField(
        max_length=14,
        blank=True,
        db_index=True,
        help_text='GS1 barcode identifier.',
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name='products',
        db_index=True,
    )
    description = models.TextField(blank=True)
    unit_of_measure = models.CharField(max_length=50)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default='TZS')
    minimum_order_quantity = models.PositiveIntegerField(default=1)
    is_cold_chain_required = models.BooleanField(default=False)
    temperature_range_min = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    temperature_range_max = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    tmda_registration_number = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['supplier']),
            models.Index(fields=['category']),
            models.Index(fields=['gtin']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def total_quantity_available(self) -> int:
        from marketplace.inventory import product_available_quantity

        return product_available_quantity(self)


class ProductBatch(models.Model):
    """Inventory batch for a product with expiry tracking."""

    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active'
        EXPIRED = 'EXPIRED', 'Expired'
        LOW_STOCK = 'LOW_STOCK', 'Low Stock'
        OUT_OF_STOCK = 'OUT_OF_STOCK', 'Out of Stock'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='batches',
        db_index=True,
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name='batches',
        db_index=True,
    )
    batch_number = models.CharField(max_length=100, unique=True)
    manufacture_date = models.DateField()
    expiry_date = models.DateField(db_index=True)
    quantity = models.PositiveIntegerField(default=0)
    reserved_quantity = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
    )
    storage_conditions = models.CharField(max_length=255, blank=True)
    tmda_batch_cert_number = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['expiry_date']
        indexes = [
            models.Index(fields=['expiry_date']),
            models.Index(fields=['product']),
            models.Index(fields=['supplier']),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(expiry_date__gt=models.F('manufacture_date')),
                name='batch_expiry_after_manufacture',
            ),
            models.CheckConstraint(
                check=Q(reserved_quantity__lte=models.F('quantity')),
                name='batch_reserved_lte_quantity',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.product.name} — {self.batch_number}'

    @property
    def manufacturing_date(self):
        return self.manufacture_date

    @property
    def available_quantity(self) -> int:
        return max(0, self.quantity - self.reserved_quantity)

    @property
    def status(self) -> str:
        from marketplace.inventory import compute_batch_status

        return compute_batch_status(self)

    def save(self, *args, **kwargs) -> None:
        if self.supplier_id is None and self.product_id:
            self.supplier_id = self.product.supplier_id
        super().save(*args, **kwargs)
