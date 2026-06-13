"""Dashboard summary API tests."""

from decimal import Decimal

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from authentication.models import CustomUser, Organisation
from marketplace.models import Category, Product, Supplier

VALID_PASSWORD = 'LocalTestPass1!'


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    },
)
class DashboardSummaryAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        hospital_org = Organisation.objects.create(
            name='Dash Hospital',
            type=Organisation.Type.HOSPITAL,
            is_verified=True,
        )
        cls.hospital_user = CustomUser.objects.create_user(
            email='hospital@dash.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.HOSPITAL,
            organisation=hospital_org,
            is_verified=True,
        )

        supplier_org = Organisation.objects.create(
            name='Dash Supplier',
            type=Organisation.Type.SUPPLIER,
            is_verified=True,
        )
        cls.supplier = Supplier.objects.create(
            organisation=supplier_org,
            verification_status=Supplier.VerificationStatus.VERIFIED,
        )
        cls.supplier_user = CustomUser.objects.create_user(
            email='supplier@dash.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.SUPPLIER,
            organisation=supplier_org,
            is_verified=True,
        )

        cls.admin_user = CustomUser.objects.create_user(
            email='admin@dash.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.ADMIN,
            is_staff=True,
            is_superuser=True,
            is_verified=True,
        )

        category = Category.objects.create(name='Dashboard Category')
        Product.objects.create(
            supplier=cls.supplier,
            name='Dashboard Product',
            category=category,
            unit_of_measure='tablet',
            price=Decimal('1000.00'),
        )

    def test_hospital_summary_returns_200(self):
        self.client.force_authenticate(user=self.hospital_user)
        response = self.client.get('/api/v1/dashboard/hospital/summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('total_orders', response.data)
        self.assertIn('cart_items', response.data)

    def test_supplier_summary_returns_200(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.get('/api/v1/dashboard/supplier/summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_products'], 1)

    def test_admin_summary_returns_200(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/v1/dashboard/admin/summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['total_users'], 3)

    def test_hospital_cannot_access_admin_summary(self):
        self.client.force_authenticate(user=self.hospital_user)
        response = self.client.get('/api/v1/dashboard/admin/summary/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_supplier_cannot_access_hospital_summary(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.get('/api/v1/dashboard/hospital/summary/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_returns_401(self):
        response = self.client.get('/api/v1/dashboard/hospital/summary/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
