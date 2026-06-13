"""Marketplace model and service tests."""

from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase

from authentication.models import Organisation
from marketplace.models import Category, Product, ProductBatch, Supplier
from marketplace.services import validate_brela_number, validate_tmda_license_number


class SupplierValidationTests(TestCase):
    def test_valid_brela_number(self):
        self.assertEqual(
            validate_brela_number('12345678-12345'),
            '12345678-12345',
        )

    def test_invalid_brela_number(self):
        with self.assertRaises(ValueError):
            validate_brela_number('1234-5678')

    def test_valid_tmda_license(self):
        self.assertEqual(
            validate_tmda_license_number('tmda/dar/2024/1234'),
            'TMDA/DAR/2024/1234',
        )

    def test_invalid_tmda_license(self):
        with self.assertRaises(ValueError):
            validate_tmda_license_number('INVALID')


class ProductBatchConstraintTests(TestCase):
    def setUp(self):
        organisation = Organisation.objects.create(
            name='Test Supplier Org',
            type=Organisation.Type.SUPPLIER,
        )
        supplier = Supplier.objects.create(organisation=organisation)
        category = Category.objects.create(name='Antibiotics')
        self.product = Product.objects.create(
            supplier=supplier,
            name='Amoxicillin 500mg',
            category=category,
            unit_of_measure='tablet',
            price=Decimal('1500.00'),
        )

    def test_expiry_must_be_after_manufacture_date(self):
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductBatch.objects.create(
                    product=self.product,
                    batch_number='BATCH-001',
                    manufacture_date=date.today(),
                    expiry_date=date.today() - timedelta(days=1),
                    quantity=100,
                )


class ProductBatchExpiryAlertTests(TestCase):
    def setUp(self):
        organisation = Organisation.objects.create(
            name='Alert Supplier Org',
            type=Organisation.Type.SUPPLIER,
        )
        supplier = Supplier.objects.create(organisation=organisation)
        category = Category.objects.create(name='Vaccines')
        self.product = Product.objects.create(
            supplier=supplier,
            name='BCG Vaccine',
            category=category,
            unit_of_measure='vial',
            price=Decimal('5000.00'),
        )

    def test_pre_save_queues_alert_for_near_expiry_batch(self):
        from unittest.mock import patch

        with patch('marketplace.tasks.send_batch_expiry_alert') as mock_task:
            ProductBatch.objects.create(
                product=self.product,
                batch_number='BATCH-NEAR',
                manufacture_date=date.today() - timedelta(days=30),
                expiry_date=date.today() + timedelta(days=30),
                quantity=50,
            )
            mock_task.delay.assert_called_once()
