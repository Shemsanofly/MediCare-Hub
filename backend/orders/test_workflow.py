"""Order supplier workflow API tests."""

from decimal import Decimal

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from authentication.models import CustomUser, Organisation
from marketplace.models import Category, Product, Supplier
from orders.models import Order, OrderItem


VALID_PASSWORD = 'LocalTestPass1!'


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    },
)
class OrderWorkflowAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        hospital_org = Organisation.objects.create(
            name='Workflow Hospital',
            type=Organisation.Type.HOSPITAL,
        )
        cls.hospital_user = CustomUser.objects.create_user(
            email='hospital@workflow.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.HOSPITAL,
            organisation=hospital_org,
        )

        supplier_org = Organisation.objects.create(
            name='Workflow Supplier',
            type=Organisation.Type.SUPPLIER,
            is_verified=True,
        )
        cls.supplier = Supplier.objects.create(
            organisation=supplier_org,
            verification_status=Supplier.VerificationStatus.VERIFIED,
        )
        cls.supplier_user = CustomUser.objects.create_user(
            email='supplier@workflow.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.SUPPLIER,
            organisation=supplier_org,
            is_verified=True,
        )

        other_supplier_org = Organisation.objects.create(
            name='Other Supplier',
            type=Organisation.Type.SUPPLIER,
        )
        cls.other_supplier_user = CustomUser.objects.create_user(
            email='other@workflow.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.SUPPLIER,
            organisation=other_supplier_org,
        )

        category = Category.objects.create(name='Workflow Category')
        product = Product.objects.create(
            supplier=cls.supplier,
            name='Workflow Product',
            category=category,
            unit_of_measure='tablet',
            price=Decimal('1000.00'),
        )

        cls.order = Order.objects.create(
            buyer=cls.hospital_user,
            organisation=hospital_org,
            supplier=cls.supplier,
            status=Order.Status.PENDING,
            subtotal=Decimal('1000.00'),
            total_amount=Decimal('1000.00'),
        )
        OrderItem.objects.create(
            order=cls.order,
            product=product,
            quantity_ordered=1,
            unit_price=Decimal('1000.00'),
            subtotal=Decimal('1000.00'),
        )

    def _advance_to_delivered(self):
        self.client.force_authenticate(user=self.supplier_user)
        for path in ('accept', 'prepare', 'ship', 'deliver'):
            response = self.client.post(f'/api/v1/orders/{self.order.id}/{path}/')
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            self.order.refresh_from_db()

    def test_unauthenticated_accept_returns_401(self):
        response = self.client.post(f'/api/v1/orders/{self.order.id}/accept/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_hospital_cannot_accept_order_returns_403(self):
        self.client.force_authenticate(user=self.hospital_user)
        response = self.client.post(f'/api/v1/orders/{self.order.id}/accept/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_other_supplier_cannot_accept_order_returns_404(self):
        self.client.force_authenticate(user=self.other_supplier_user)
        response = self.client.post(f'/api/v1/orders/{self.order.id}/accept/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_transition_returns_400(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.post(f'/api/v1/orders/{self.order.id}/prepare/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['code'], 'INVALID_TRANSITION')

    def test_full_order_lifecycle(self):
        self.client.force_authenticate(user=self.supplier_user)

        response = self.client.post(f'/api/v1/orders/{self.order.id}/accept/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.ACCEPTED)

        response = self.client.post(f'/api/v1/orders/{self.order.id}/prepare/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.PREPARING)

        response = self.client.post(f'/api/v1/orders/{self.order.id}/ship/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.SHIPPED)

        response = self.client.post(f'/api/v1/orders/{self.order.id}/deliver/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.DELIVERED)

        self.client.force_authenticate(user=self.hospital_user)
        response = self.client.post(f'/api/v1/orders/{self.order.id}/complete/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.COMPLETED)

        detail = self.client.get(f'/api/v1/orders/orders/{self.order.id}/')
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(len(detail.data['status_history']), 5)

    def test_supplier_can_reject_pending_order(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.post(
            f'/api/v1/orders/{self.order.id}/reject/',
            {'reason': 'Unable to fulfill this order at this time.'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.REJECTED)

    def test_hospital_cannot_complete_before_delivered(self):
        self.client.force_authenticate(user=self.supplier_user)
        self.client.post(f'/api/v1/orders/{self.order.id}/accept/')

        self.client.force_authenticate(user=self.hospital_user)
        response = self.client.post(f'/api/v1/orders/{self.order.id}/complete/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_supplier_cannot_complete_order_returns_403(self):
        self._advance_to_delivered()
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.post(f'/api/v1/orders/{self.order.id}/complete/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_supplier_can_list_and_retrieve_orders(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.get('/api/v1/orders/orders/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)

        detail = self.client.get(f'/api/v1/orders/orders/{self.order.id}/')
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertIn('status_history', detail.data)
