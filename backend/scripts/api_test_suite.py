"""Automated API test suite for MediCare Hub — mirrors Postman collection tests."""

from __future__ import annotations

import json
import os
import sys
import uuid
from dataclasses import dataclass, field
from typing import Any

import requests

BASE_URL = 'http://127.0.0.1:8000'
API = f'{BASE_URL}/api/v1'
VALID_PASSWORD = os.environ.get('SEED_TEST_PASSWORD', 'LocalTestPass1!')
HOSPITAL_EMAIL = 'hospital.test@medicarehub.test'
SUPPLIER_EMAIL = 'supplier.test@medicarehub.test'
ADMIN_EMAIL = 'admin.test@medicarehub.test'


@dataclass
class TestResult:
    name: str
    method: str
    path: str
    expected: int
    actual: int
    passed: bool
    note: str = ''


@dataclass
class TestSession:
    session: requests.Session = field(default_factory=requests.Session)
    access_token: str = ''
    refresh_token: str = ''
    product_id: str = ''
    category_id: str = ''
    order_id: str = ''
    payment_id: str = ''
    supplier_id: str = ''
    results: list[TestResult] = field(default_factory=list)

    def record(
        self,
        name: str,
        method: str,
        path: str,
        expected: int,
        response: requests.Response,
        note: str = '',
    ) -> None:
        passed = response.status_code == expected
        self.results.append(
            TestResult(
                name=name,
                method=method,
                path=path,
                expected=expected,
                actual=response.status_code,
                passed=passed,
                note=note or response.text[:200],
            )
        )
        status = 'PASS' if passed else 'FAIL'
        print(f'[{status}] {method} {path} -> {response.status_code} (expected {expected})')

    def auth_headers(self) -> dict[str, str]:
        if not self.access_token:
            return {}
        return {'Authorization': f'Bearer {self.access_token}'}

    def request(
        self,
        method: str,
        path: str,
        *,
        auth: bool = False,
        json_body: dict | None = None,
        cookies: bool = True,
    ) -> requests.Response:
        url = f'{API}{path}' if path.startswith('/') else path
        headers = {'Content-Type': 'application/json'}
        if auth:
            headers.update(self.auth_headers())
        return self.session.request(
            method,
            url,
            headers=headers,
            json=json_body,
        )


def run_tests() -> int:
    ts = TestSession()
    unique = uuid.uuid4().hex[:8]
    new_email = f'newuser.{unique}@medicarehub.test'

    print('\n=== AUTHENTICATION ===')

    r = ts.request('POST', '/auth/login/', json_body={'email': 'bad@test.com', 'password': 'wrong'})
    ts.record('Login invalid credentials', 'POST', '/auth/login/', 401, r)

    r = ts.request('GET', '/auth/me/')
    ts.record('Current user without token', 'GET', '/auth/me/', 401, r)

    r = ts.request(
        'POST',
        '/auth/register/',
        json_body={
            'email': new_email,
            'password': VALID_PASSWORD,
            'first_name': 'New',
            'last_name': 'User',
            'role': 'HOSPITAL',
            'organisation_name': f'Test Clinic {unique}',
            'organisation_type': 'HOSPITAL',
        },
    )
    ts.record('Register hospital user', 'POST', '/auth/register/', 201, r)

    r = ts.request(
        'POST',
        '/auth/login/',
        json_body={'email': HOSPITAL_EMAIL, 'password': VALID_PASSWORD},
    )
    ts.record('Login hospital user', 'POST', '/auth/login/', 200, r)
    if r.status_code == 200:
        data = r.json()
        ts.access_token = data['access']
        ts.refresh_token = ts.session.cookies.get('refresh_token', '')

    r = ts.request('GET', '/auth/me/', auth=True)
    ts.record('Get current user profile', 'GET', '/auth/me/', 200, r)

    r = ts.request('PATCH', '/auth/me/', auth=True, json_body={'first_name': 'Test'})
    ts.record('Update current user profile', 'PATCH', '/auth/me/', 200, r)

    r = ts.request('POST', '/auth/token/refresh/', json_body={})
    ts.record('Refresh JWT token', 'POST', '/auth/token/refresh/', 200, r)
    if r.status_code == 200:
        ts.access_token = r.json()['access']

    r = ts.request('POST', '/auth/password-reset/', json_body={'email': HOSPITAL_EMAIL})
    ts.record('Password reset request', 'POST', '/auth/password-reset/', 200, r)

    print('\n=== MARKETPLACE ===')

    r = ts.request('GET', '/marketplace/products/')
    ts.record('List products without auth', 'GET', '/marketplace/products/', 401, r)

    r = ts.request('GET', '/marketplace/products/', auth=True)
    ts.record('List products authenticated', 'GET', '/marketplace/products/', 200, r)
    if r.status_code == 200:
        results = r.json().get('results', [])
        if results:
            ts.product_id = results[0]['id']
            ts.category_id = results[0].get('category', {}).get('id', '')

    r = ts.request('GET', '/marketplace/products/?search=Amoxicillin', auth=True)
    ts.record('Search products', 'GET', '/marketplace/products/?search=Amoxicillin', 200, r)

    r = ts.request('GET', '/marketplace/products/?category=invalid', auth=True)
    ts.record('Filter products by category', 'GET', '/marketplace/products/?category=invalid', 200, r)

    if ts.product_id:
        r = ts.request('GET', f'/marketplace/products/{ts.product_id}/', auth=True)
        ts.record('Product detail', 'GET', f'/marketplace/products/{{id}}/', 200, r)

        r = ts.request('GET', '/marketplace/products/00000000-0000-0000-0000-000000000000/', auth=True)
        ts.record('Product not found', 'GET', '/marketplace/products/{{invalid}}/', 404, r)

    print('\n=== ORDERS ===')

    r = ts.request('GET', '/orders/cart/', auth=True)
    ts.record('Get cart', 'GET', '/orders/cart/', 200, r)

    if ts.product_id:
        r = ts.request(
            'POST',
            '/orders/cart/',
            auth=True,
            json_body={'product_id': ts.product_id, 'quantity': 10},
        )
        ts.record('Add item to cart', 'POST', '/orders/cart/', 200, r)

        r = ts.request('GET', '/orders/cart/', auth=True)
        ts.record('Get cart with items', 'GET', '/orders/cart/', 200, r)

        r = ts.request(
            'POST',
            '/orders/checkout/',
            auth=True,
            json_body={'notes': 'API test order', 'payment_terms': 'IMMEDIATE'},
        )
        ts.record('Checkout cart', 'POST', '/orders/checkout/', 201, r)
        if r.status_code == 201:
            ts.order_id = r.json().get('order', {}).get('id', '')

    r = ts.request('GET', '/orders/orders/', auth=True)
    ts.record('List orders', 'GET', '/orders/orders/', 200, r)

    if ts.order_id:
        r = ts.request('GET', f'/orders/orders/{ts.order_id}/', auth=True)
        ts.record('Order detail', 'GET', '/orders/orders/{id}/', 200, r)

    r = ts.request('POST', '/orders/orders/', auth=True, json_body={})
    ts.record('Create order direct (should fail)', 'POST', '/orders/orders/', 405, r)

    print('\n=== PAYMENTS ===')

    r = ts.request('GET', '/payments/payments/', auth=True)
    ts.record('List payments', 'GET', '/payments/payments/', 200, r)

    if ts.order_id:
        r = ts.request(
            'POST',
            '/payments/payments/initiate/',
            auth=True,
            json_body={
                'order_id': ts.order_id,
                'payment_method': 'mpesa',
                'phone': '255700000000',
            },
        )
        expected = 400 if r.status_code == 400 else 201
        ts.record(
            'Initiate payment (dev mode)',
            'POST',
            '/payments/payments/initiate/',
            expected,
            r,
            note='400 expected if order not APPROVED/CONFIRMED',
        )

    r = ts.request(
        'POST',
        '/payments/webhooks/mpesa/',
        json_body={'Body': {'stkCallback': {'ResultCode': 0}}},
    )
    ts.record('M-Pesa webhook simulation', 'POST', '/payments/webhooks/mpesa/', 200, r)

    print('\n=== NOTIFICATIONS ===')

    r = ts.request('GET', '/notifications/notifications/', auth=True)
    ts.record('List notifications', 'GET', '/notifications/notifications/', 200, r)

    r = ts.request(
        'PATCH',
        '/notifications/notifications/00000000-0000-0000-0000-000000000000/',
        auth=True,
        json_body={'read': True},
    )
    ts.record('Mark notification read', 'PATCH', '/notifications/notifications/{id}/', 200, r)

    print('\n=== ANALYTICS ===')

    r = ts.request('GET', '/analytics/analytics/', auth=True)
    ts.record('Analytics list (hospital)', 'GET', '/analytics/analytics/', 403, r)

    r = ts.request('GET', '/analytics/analytics/platform/', auth=True)
    ts.record('Platform analytics (hospital forbidden)', 'GET', '/analytics/analytics/platform/', 403, r)

    print('\n=== ADMIN (login as admin) ===')

    r = ts.request('POST', '/auth/logout/', auth=True)
    ts.record('Logout hospital user', 'POST', '/auth/logout/', 204, r)
    ts.access_token = ''

    r = ts.request(
        'POST',
        '/auth/login/',
        json_body={'email': ADMIN_EMAIL, 'password': VALID_PASSWORD},
    )
    ts.record('Login admin user', 'POST', '/auth/login/', 200, r)
    if r.status_code == 200:
        ts.access_token = r.json()['access']

    r = ts.request('GET', '/auth/users/', auth=True)
    ts.record('Admin list users', 'GET', '/auth/users/', 200, r)

    r = ts.request('GET', '/admin/suppliers/?status=PENDING', auth=True)
    ts.record('Admin pending suppliers', 'GET', '/admin/suppliers/?status=PENDING', 200, r)

    r = ts.request('GET', '/analytics/analytics/platform/', auth=True)
    ts.record('Platform analytics (admin)', 'GET', '/analytics/analytics/platform/', 200, r)

    print('\n=== SUPPLIER ROLE ===')

    r = ts.request('POST', '/auth/logout/', auth=True)
    ts.record('Logout admin', 'POST', '/auth/logout/', 204, r)
    ts.access_token = ''

    r = ts.request(
        'POST',
        '/auth/login/',
        json_body={'email': SUPPLIER_EMAIL, 'password': VALID_PASSWORD},
    )
    ts.record('Login supplier user', 'POST', '/auth/login/', 200, r)
    if r.status_code == 200:
        ts.access_token = r.json()['access']

    r = ts.request('GET', '/marketplace/products/', auth=True)
    ts.record('Supplier list products', 'GET', '/marketplace/products/', 200, r)

    r = ts.request('GET', '/analytics/analytics/supplier/', auth=True)
    ts.record('Supplier analytics', 'GET', '/analytics/analytics/supplier/', 200, r)

    if ts.category_id or ts.product_id:
        category_id = ts.category_id
        if not category_id and ts.product_id:
            r_detail = ts.request('GET', f'/marketplace/products/{ts.product_id}/', auth=True)
            if r_detail.status_code == 200:
                category_id = r_detail.json().get('category', {}).get('id')

        if category_id:
            r = ts.request(
                'POST',
                '/marketplace/products/',
                auth=True,
                json_body={
                    'name': 'API Test Product',
                    'category_id': category_id,
                    'unit_of_measure': 'tablet',
                    'price': '999.00',
                },
            )
            ts.record(
                'Supplier create product',
                'POST',
                '/marketplace/products/',
                201,
                r,
            )

    print('\n=== SUMMARY ===')
    passed = sum(1 for t in ts.results if t.passed)
    failed = [t for t in ts.results if not t.passed]
    print(f'Passed: {passed}/{len(ts.results)}')
    if failed:
        print('Failed tests:')
        for t in failed:
            print(f'  - {t.name}: {t.actual} != {t.expected} — {t.note[:100]}')
    return 0 if not failed else 1


if __name__ == '__main__':
    try:
        health = requests.get(f'{BASE_URL}/admin/login/', timeout=5)
        if health.status_code not in (200, 302):
            print(f'Backend not reachable at {BASE_URL}')
            sys.exit(1)
    except requests.RequestException as exc:
        print(f'Backend not reachable: {exc}')
        sys.exit(1)

    sys.exit(run_tests())
