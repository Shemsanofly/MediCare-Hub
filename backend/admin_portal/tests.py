"""Admin portal API tests."""

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
class AdminPortalAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        hospital_org = Organisation.objects.create(
            name='Admin Test Hospital',
            type=Organisation.Type.HOSPITAL,
        )
        cls.hospital_user = CustomUser.objects.create_user(
            email='hospital@adminportal.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.HOSPITAL,
            organisation=hospital_org,
        )

        supplier_org = Organisation.objects.create(
            name='Admin Test Supplier',
            type=Organisation.Type.SUPPLIER,
        )
        cls.supplier = Supplier.objects.create(
            organisation=supplier_org,
            verification_status=Supplier.VerificationStatus.PENDING,
        )
        cls.supplier_user = CustomUser.objects.create_user(
            email='supplier@adminportal.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.SUPPLIER,
            organisation=supplier_org,
        )

        cls.admin_user = CustomUser.objects.create_user(
            email='admin@adminportal.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.ADMIN,
            is_staff=True,
            is_superuser=True,
        )

        category = Category.objects.create(name='Admin Test Category')
        cls.product = Product.objects.create(
            supplier=cls.supplier,
            name='Admin Test Product',
            category=category,
            unit_of_measure='tablet',
            price=Decimal('500.00'),
        )

    def test_admin_can_list_users(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/v1/admin/users/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)

    def test_admin_can_list_suppliers(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/v1/admin/suppliers/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)

    def test_admin_can_list_products(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/v1/admin/products/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)

    def test_admin_can_list_orders(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/v1/admin/orders/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)

    def test_hospital_cannot_access_admin_users(self):
        self.client.force_authenticate(user=self.hospital_user)
        response = self.client.get('/api/v1/admin/users/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_supplier_cannot_access_admin_suppliers(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.get('/api/v1/admin/suppliers/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_admin_users_returns_401(self):
        response = self.client.get('/api/v1/admin/users/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_can_verify_supplier(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/v1/admin/suppliers/{self.supplier.id}/verify/',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.supplier.refresh_from_db()
        self.assertEqual(
            self.supplier.verification_status,
            Supplier.VerificationStatus.VERIFIED,
        )

    def test_admin_can_reject_supplier(self):
        pending = Supplier.objects.create(
            organisation=Organisation.objects.create(
                name='Reject Supplier Org',
                type=Organisation.Type.SUPPLIER,
            ),
            verification_status=Supplier.VerificationStatus.PENDING,
        )
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(
            f'/api/v1/admin/suppliers/{pending.id}/reject/',
            {'reason': 'Incomplete documentation provided.'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        pending.refresh_from_db()
        self.assertEqual(
            pending.verification_status,
            Supplier.VerificationStatus.REJECTED,
        )

    def test_admin_can_deactivate_user(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(
            f'/api/v1/admin/users/{self.hospital_user.id}/',
            {'is_active': False},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.hospital_user.refresh_from_db()
        self.assertFalse(self.hospital_user.is_active)
