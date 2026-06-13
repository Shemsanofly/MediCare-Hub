"""Admin portal query helpers."""

from __future__ import annotations

from django.db.models import Q, Sum

from authentication.models import CustomUser
from marketplace.models import Product, Supplier
from orders.models import Order
from orders.services import CheckoutService
from payments.models import Payment


def filter_users(
    *,
    search: str = '',
    role: str = '',
    is_active: str | None = None,
):
    queryset = CustomUser.objects.select_related('organisation').order_by('-created_at')
    if search:
        queryset = queryset.filter(
            Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
        )
    if role:
        queryset = queryset.filter(role=role.upper())
    if is_active is not None and is_active != '':
        queryset = queryset.filter(is_active=is_active.lower() in ('true', '1', 'yes'))
    return queryset


def filter_suppliers(*, search: str = '', status: str = ''):
    queryset = (
        Supplier.objects.select_related('organisation', 'verified_by')
        .prefetch_related('documents')
        .order_by('-created_at')
    )
    if search:
        queryset = queryset.filter(
            Q(organisation__name__icontains=search)
            | Q(brela_registration_number__icontains=search)
            | Q(tmda_license_number__icontains=search)
        )
    if status:
        queryset = queryset.filter(verification_status=status.upper())
    return queryset


def filter_products(
    *,
    search: str = '',
    category: str = '',
    supplier: str = '',
    stock_status: str = '',
    is_active: str | None = None,
):
    queryset = (
        Product.objects.select_related('supplier', 'supplier__organisation', 'category')
        .prefetch_related('batches')
        .order_by('-updated_at')
    )
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search) | Q(generic_name__icontains=search)
        )
    if category:
        queryset = queryset.filter(category_id=category)
    if supplier:
        queryset = queryset.filter(supplier_id=supplier)
    if is_active is not None and is_active != '':
        queryset = queryset.filter(is_active=is_active.lower() in ('true', '1', 'yes'))
    products = list(queryset[:200])
    if stock_status == 'low':
        return [p for p in products if p.total_quantity_available < 50][:100]
    if stock_status == 'out':
        return [p for p in products if p.total_quantity_available == 0][:100]
    return products[:100]


def filter_orders(*, status: str = '', search: str = ''):
    queryset = (
        Order.objects.select_related(
            'buyer',
            'organisation',
            'supplier',
            'supplier__organisation',
        )
        .prefetch_related('items__product', 'payments')
        .order_by('-created_at')
    )
    if status:
        queryset = queryset.filter(status=status.upper())
    if search:
        queryset = queryset.filter(
            Q(organisation__name__icontains=search)
            | Q(supplier__organisation__name__icontains=search)
            | Q(lpo_number__icontains=search)
        )
    return queryset[:100]


def serialize_order_for_admin(order: Order) -> dict:
    data = CheckoutService._serialize_order(order)
    latest_payment = order.payments.order_by('-initiated_at').first()
    data['hospital_name'] = order.organisation.name
    data['payment_status'] = latest_payment.status if latest_payment else 'NONE'
    data['payment_amount'] = str(latest_payment.amount) if latest_payment else None
    return data
