"""Seed minimal test data for API and frontend integration testing."""

import os
import sys
from datetime import date, timedelta
from decimal import Decimal

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'medicare_hub.settings.development')
django.setup()

from authentication.models import CustomUser, Organisation  # noqa: E402
from marketplace.models import Category, Product, ProductBatch, Supplier  # noqa: E402

VALID_PASSWORD = os.environ.get('SEED_TEST_PASSWORD', 'LocalTestPass1!')

HOSPITAL_EMAIL = 'hospital.test@medicarehub.test'
SUPPLIER_EMAIL = 'supplier.test@medicarehub.test'
ADMIN_EMAIL = 'admin.test@medicarehub.test'


def get_or_create_hospital_user():
    org, _ = Organisation.objects.get_or_create(
        name='Test General Hospital',
        defaults={
            'type': Organisation.Type.HOSPITAL,
            'registration_number': 'HOSP-001',
            'is_verified': True,
        },
    )
    user, created = CustomUser.objects.get_or_create(
        email=HOSPITAL_EMAIL,
        defaults={
            'first_name': 'Test',
            'last_name': 'Hospital',
            'role': CustomUser.Role.HOSPITAL,
            'organisation': org,
            'is_verified': True,
        },
    )
    if created:
        user.set_password(VALID_PASSWORD)
        user.save()
    return user


def get_or_create_supplier_user():
    org, _ = Organisation.objects.get_or_create(
        name='MedSupply Tanzania Ltd',
        defaults={
            'type': Organisation.Type.SUPPLIER,
            'registration_number': 'SUP-001',
            'tmda_license': 'TMDA/DAR/2024/0001',
            'is_verified': True,
        },
    )
    supplier, _ = Supplier.objects.get_or_create(
        organisation=org,
        defaults={
            'verification_status': Supplier.VerificationStatus.VERIFIED,
            'trust_score': 85,
            'average_delivery_days': Decimal('3.00'),
        },
    )
    if supplier.verification_status != Supplier.VerificationStatus.VERIFIED:
        supplier.verification_status = Supplier.VerificationStatus.VERIFIED
        supplier.trust_score = 85
        supplier.save()

    user, created = CustomUser.objects.get_or_create(
        email=SUPPLIER_EMAIL,
        defaults={
            'first_name': 'Test',
            'last_name': 'Supplier',
            'role': CustomUser.Role.SUPPLIER,
            'organisation': org,
            'is_verified': True,
        },
    )
    if created:
        user.set_password(VALID_PASSWORD)
        user.save()
    return user, supplier


def get_or_create_admin_user():
    user, created = CustomUser.objects.get_or_create(
        email=ADMIN_EMAIL,
        defaults={
            'first_name': 'Test',
            'last_name': 'Admin',
            'role': CustomUser.Role.ADMIN,
            'is_staff': True,
            'is_superuser': True,
            'is_verified': True,
        },
    )
    if created:
        user.set_password(VALID_PASSWORD)
        user.save()
    return user


def seed_products(supplier: Supplier):
    category, _ = Category.objects.get_or_create(
        name='Antibiotics',
        defaults={'is_regulated': True, 'tmda_required': True},
    )
    product, created = Product.objects.get_or_create(
        supplier=supplier,
        name='Amoxicillin 500mg Capsules',
        defaults={
            'generic_name': 'Amoxicillin',
            'gtin': '0614141123456',
            'description': 'Broad-spectrum antibiotic capsules.',
            'category': category,
            'unit_of_measure': 'capsule',
            'price': Decimal('1500.00'),
            'currency': 'TZS',
            'minimum_order_quantity': 10,
            'is_active': True,
            'tmda_registration_number': 'TMDA/DAR/2024/1234',
        },
    )
    if created or not product.batches.exists():
        ProductBatch.objects.get_or_create(
            product=product,
            batch_number='AMX-2025-001',
            defaults={
                'manufacture_date': date.today() - timedelta(days=60),
                'expiry_date': date.today() + timedelta(days=365),
                'quantity': 500,
                'storage_conditions': 'Store below 25°C',
            },
        )
    return product


if __name__ == '__main__':
    hospital = get_or_create_hospital_user()
    supplier_user, supplier = get_or_create_supplier_user()
    admin = get_or_create_admin_user()
    product = seed_products(supplier)
    print('Seed complete:')
    print(f'  Hospital: {hospital.email}')
    print(f'  Supplier: {supplier_user.email}')
    print(f'  Admin:    {admin.email}')
    print('  Password: set via SEED_TEST_PASSWORD env var (see script default if unset)')
    print(f'  Product:  {product.name} ({product.id})')
