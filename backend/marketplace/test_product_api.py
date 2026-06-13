"""API tests for product routing and RBAC."""

from decimal import Decimal

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from authentication.models import CustomUser, Organisation
from marketplace.models import Category, Product, Supplier

VALID_PASSWORD = 'LocalTestPass1!'
PRODUCTS_URL = '/api/v1/marketplace/products/'


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    },
)
class ProductViewSetAPITests(APITestCase):
    """Integration tests for ProductViewSet collection and detail routes."""

    @classmethod
    def setUpTestData(cls):
        cls.category = Category.objects.create(name='Analgesics')

        hospital_org = Organisation.objects.create(
            name='Test Hospital',
            type=Organisation.Type.HOSPITAL,
            is_verified=True,
        )
        cls.hospital_user = CustomUser.objects.create_user(
            email='hospital@producttest.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.HOSPITAL,
            organisation=hospital_org,
            is_verified=True,
        )

        supplier_org = Organisation.objects.create(
            name='Verified Supplier Co',
            type=Organisation.Type.SUPPLIER,
            is_verified=True,
        )
        cls.supplier = Supplier.objects.create(
            organisation=supplier_org,
            verification_status=Supplier.VerificationStatus.VERIFIED,
            trust_score=90,
        )
        cls.supplier_user = CustomUser.objects.create_user(
            email='supplier@producttest.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.SUPPLIER,
            organisation=supplier_org,
            is_verified=True,
        )

        cls.admin_user = CustomUser.objects.create_user(
            email='admin@producttest.test',
            password=VALID_PASSWORD,
            role=CustomUser.Role.ADMIN,
            is_staff=True,
            is_superuser=True,
            is_verified=True,
        )

        cls.existing_product = Product.objects.create(
            supplier=cls.supplier,
            name='Existing Product',
            category=cls.category,
            unit_of_measure='tablet',
            price=Decimal('1000.00'),
        )

    def _valid_payload(self, **overrides):
        payload = {
            'name': 'Paracetamol 500mg',
            'category_id': str(self.category.id),
            'unit_of_measure': 'tablet',
            'price': '2500.00',
        }
        payload.update(overrides)
        return payload

    def test_list_products(self):
        self.client.force_authenticate(user=self.hospital_user)
        response = self.client.get(PRODUCTS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)

    def test_retrieve_product(self):
        self.client.force_authenticate(user=self.hospital_user)
        response = self.client.get(f'{PRODUCTS_URL}{self.existing_product.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Existing Product')

    def test_supplier_create_product_success(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.post(
            PRODUCTS_URL,
            self._valid_payload(),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Paracetamol 500mg')
        self.assertTrue(
            Product.objects.filter(
                name='Paracetamol 500mg',
                supplier=self.supplier,
            ).exists(),
        )

    def test_hospital_create_product_denied(self):
        self.client.force_authenticate(user=self.hospital_user)
        response = self.client.post(
            PRODUCTS_URL,
            self._valid_payload(),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_create_product_success(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            PRODUCTS_URL,
            self._valid_payload(supplier_id=str(self.supplier.id)),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['supplier']['id'], str(self.supplier.id))

    def test_create_product_invalid_payload_returns_400(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.post(PRODUCTS_URL, {'name': 'Incomplete'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_collection_not_method_not_allowed(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.post(
            PRODUCTS_URL,
            self._valid_payload(),
            format='json',
        )
        self.assertNotEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_supplier_update_own_product(self):
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.patch(
            f'{PRODUCTS_URL}{self.existing_product.id}/',
            {'name': 'Updated Product Name'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.existing_product.refresh_from_db()
        self.assertEqual(self.existing_product.name, 'Updated Product Name')

    def test_supplier_delete_own_product(self):
        product = Product.objects.create(
            supplier=self.supplier,
            name='Disposable Product',
            category=self.category,
            unit_of_measure='vial',
            price=Decimal('500.00'),
        )
        self.client.force_authenticate(user=self.supplier_user)
        response = self.client.delete(f'{PRODUCTS_URL}{product.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Product.objects.filter(pk=product.id).exists())
