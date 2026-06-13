"""Inventory and batch management API tests."""

from datetime import date, timedelta
from decimal import Decimal

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from authentication.models import CustomUser, Organisation
from marketplace.models import Category, Product, ProductBatch, Supplier
from orders.models import BatchReservation, Order, OrderItem

VALID_PASSWORD = 'LocalTestPass1!'


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    },
)
class InventoryAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        hospital_org = Organisation.objects.create(
            name='Inventory Hospital',
            type=Organisation.Type.HOSPITAL,
            is_verified=True,
        )
        cls.hospital_user = CustomUser.objects.create_user(
            email='hospital@inventory.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.HOSPITAL,
            organisation=hospital_org,
            is_verified=True,
        )

        supplier_org = Organisation.objects.create(
            name='Inventory Supplier',
            type=Organisation.Type.SUPPLIER,
            is_verified=True,
        )
        cls.supplier = Supplier.objects.create(
            organisation=supplier_org,
            verification_status=Supplier.VerificationStatus.VERIFIED,
        )
        cls.supplier_user = CustomUser.objects.create_user(
            email='supplier@inventory.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.SUPPLIER,
            organisation=supplier_org,
            is_verified=True,
        )

        other_org = Organisation.objects.create(
            name='Other Supplier Org',
            type=Organisation.Type.SUPPLIER,
        )
        cls.other_supplier = Supplier.objects.create(organisation=other_org)
        cls.other_supplier_user = CustomUser.objects.create_user(
            email='other@inventory.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.SUPPLIER,
            organisation=other_org,
            is_verified=True,
        )

        category = Category.objects.create(name='Inventory Category')
        cls.product = Product.objects.create(
            supplier=cls.supplier,
            name='Inventory Product',
            category=category,
            unit_of_measure='tablet',
            price=Decimal('1000.00'),
        )

    def _create_batch(self, **overrides):
        defaults = {
            'product': self.product,
            'supplier': self.supplier,
            'batch_number': f'BATCH-{ProductBatch.objects.count() + 1}',
            'manufacture_date': date.today() - timedelta(days=30),
            'expiry_date': date.today() + timedelta(days=180),
            'quantity': 100,
            'unit_cost': Decimal('500.00'),
        }
        defaults.update(overrides)
        return ProductBatch.objects.create(**defaults)

    def test_supplier_can_create_batch(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.post(
            f'/api/v1/marketplace/products/{self.product.id}/batches/',
            {
                'batch_number': 'SUP-BATCH-001',
                'manufacturing_date': str(date.today() - timedelta(days=10)),
                'expiry_date': str(date.today() + timedelta(days=200)),
                'quantity': 75,
                'unit_cost': '450.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['quantity'], 75)
        self.assertEqual(str(response.data['unit_cost']), '450.00')

    def test_supplier_cannot_edit_other_supplier_batch(self):
        other_product = Product.objects.create(
            supplier=self.other_supplier,
            name='Other Product',
            category=self.product.category,
            unit_of_measure='tablet',
            price=Decimal('800.00'),
        )
        batch = ProductBatch.objects.create(
            product=other_product,
            supplier=self.other_supplier,
            batch_number='OTHER-001',
            manufacture_date=date.today() - timedelta(days=5),
            expiry_date=date.today() + timedelta(days=100),
            quantity=20,
        )
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.patch(
            f'/api/v1/marketplace/batches/{batch.id}/',
            {'quantity': 10},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_hospital_cannot_see_unit_cost(self):
        batch = self._create_batch(batch_number='HOSP-BATCH-001')
        self.client.force_authenticate(user=self.hospital_user)
        response = self.client.get(
            f'/api/v1/marketplace/products/{self.product.id}/batches/',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result = response.data['results'][0]
        self.assertIn('available_quantity', result)
        self.assertNotIn('unit_cost', result)

    def test_fifo_allocation_uses_nearest_expiry_first(self):
        later = self._create_batch(
            batch_number='FIFO-LATE',
            expiry_date=date.today() + timedelta(days=200),
            quantity=100,
        )
        sooner = self._create_batch(
            batch_number='FIFO-SOON',
            expiry_date=date.today() + timedelta(days=60),
            quantity=40,
        )

        order = Order.objects.create(
            buyer=self.hospital_user,
            organisation=self.hospital_user.organisation,
            supplier=self.supplier,
            status=Order.Status.PENDING,
            subtotal=Decimal('5000.00'),
            total_amount=Decimal('5000.00'),
        )

        from marketplace.inventory import allocate_fifo

        allocations = allocate_fifo(self.product, 30)
        self.assertEqual(len(allocations), 1)
        self.assertEqual(allocations[0].batch.id, sooner.id)

        allocations = allocate_fifo(self.product, 50)
        self.assertEqual(sum(item.quantity for item in allocations), 50)
        self.assertEqual(allocations[0].batch.id, sooner.id)

    def test_expired_batch_not_used_for_checkout(self):
        self._create_batch(
            batch_number='EXPIRED-001',
            expiry_date=date.today() - timedelta(days=1),
            quantity=100,
        )
        active = self._create_batch(batch_number='ACTIVE-001', quantity=20)

        from marketplace.inventory import allocate_fifo

        allocations = allocate_fifo(self.product, 10)
        self.assertEqual(allocations[0].batch.id, active.id)

    def test_insufficient_stock_blocks_checkout(self):
        self._create_batch(batch_number='LOW-001', quantity=5)
        order = Order.objects.create(
            buyer=self.hospital_user,
            organisation=self.hospital_user.organisation,
            supplier=self.supplier,
            status=Order.Status.PENDING,
            subtotal=Decimal('10000.00'),
            total_amount=Decimal('10000.00'),
        )

        from marketplace.inventory import allocate_fifo
        from orders.errors import CheckoutError

        with self.assertRaises(CheckoutError):
            allocate_fifo(self.product, 10)

    def test_reject_order_releases_reserved_stock(self):
        batch = self._create_batch(batch_number='RESERVE-001', quantity=50)
        order = Order.objects.create(
            buyer=self.hospital_user,
            organisation=self.hospital_user.organisation,
            supplier=self.supplier,
            status=Order.Status.PENDING,
            subtotal=Decimal('5000.00'),
            total_amount=Decimal('5000.00'),
        )
        order_item = OrderItem.objects.create(
            order=order,
            product=self.product,
            batch=batch,
            quantity_ordered=10,
            unit_price=Decimal('1000.00'),
            subtotal=Decimal('10000.00'),
        )
        from marketplace.inventory import allocate_fifo, reserve_allocations, release_order_reservations

        allocations = allocate_fifo(self.product, 10)
        reserve_allocations(order=order, order_item=order_item, allocations=allocations)
        batch.refresh_from_db()
        self.assertEqual(batch.reserved_quantity, 10)
        self.assertEqual(batch.available_quantity, 40)

        release_order_reservations(order)
        batch.refresh_from_db()
        self.assertEqual(batch.reserved_quantity, 0)
        self.assertEqual(batch.available_quantity, 50)

    def test_complete_order_deducts_stock(self):
        batch = self._create_batch(batch_number='FULFILL-001', quantity=50)
        order = Order.objects.create(
            buyer=self.hospital_user,
            organisation=self.hospital_user.organisation,
            supplier=self.supplier,
            status=Order.Status.DELIVERED,
            subtotal=Decimal('5000.00'),
            total_amount=Decimal('5000.00'),
        )
        order_item = OrderItem.objects.create(
            order=order,
            product=self.product,
            batch=batch,
            quantity_ordered=10,
            unit_price=Decimal('1000.00'),
            subtotal=Decimal('10000.00'),
        )
        from marketplace.inventory import (
            allocate_fifo,
            fulfill_order_reservations,
            reserve_allocations,
        )

        allocations = allocate_fifo(self.product, 10)
        reserve_allocations(order=order, order_item=order_item, allocations=allocations)

        fulfill_order_reservations(order)
        batch.refresh_from_db()
        self.assertEqual(batch.quantity, 40)
        self.assertEqual(batch.reserved_quantity, 0)
        self.assertTrue(
            BatchReservation.objects.filter(order=order, is_fulfilled=True).exists(),
        )
