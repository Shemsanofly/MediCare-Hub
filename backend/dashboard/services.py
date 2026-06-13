"""Dashboard summary aggregation using SQLite-compatible ORM queries."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from authentication.models import AuditLog, CustomUser, Organisation
from marketplace.models import Product, Supplier
from orders.models import Order, OrderItem
from orders.services import CartService, CheckoutService
from payments.models import Payment


LOW_STOCK_THRESHOLD = 50
PENDING_STATUSES = (
    Order.Status.PENDING,
    Order.Status.APPROVED,
    Order.Status.CONFIRMED,
    Order.Status.PROCESSING,
)


def _month_start() -> datetime:
    now = timezone.now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _serialize_order_summary(order: Order) -> dict:
    return CheckoutService._serialize_order(order)


def _status_breakdown(queryset) -> list[dict]:
    counts = (
        queryset.values('status')
        .annotate(count=Count('id'))
        .order_by('status')
    )
    return [{'status': row['status'], 'count': row['count']} for row in counts]


def _spending_by_month(queryset, months: int = 6) -> list[dict]:
    since = timezone.now().replace(day=1)
    for _ in range(months - 1):
        if since.month == 1:
            since = since.replace(year=since.year - 1, month=12)
        else:
            since = since.replace(month=since.month - 1)

    rows = (
        queryset.filter(created_at__gte=since)
        .annotate(month=TruncMonth('created_at'))
        .values('month')
        .annotate(total=Sum('total_amount'))
        .order_by('month')
    )
    return [
        {
            'month': row['month'].strftime('%Y-%m') if row['month'] else '',
            'amount': str(row['total'] or Decimal('0.00')),
        }
        for row in rows
    ]


def get_hospital_summary(user: CustomUser) -> dict:
    org_id = user.organisation_id
    orders = Order.objects.filter(organisation_id=org_id).select_related(
        'supplier',
        'supplier__organisation',
    )
    now = timezone.now()
    month_start = _month_start()

    total_orders = orders.count()
    pending_orders = orders.filter(status__in=PENDING_STATUSES).count()
    delivered_orders = orders.filter(status=Order.Status.DELIVERED).count()
    monthly_spending = (
        orders.filter(created_at__gte=month_start).aggregate(
            total=Sum('total_amount'),
        )['total']
        or Decimal('0.00')
    )

    cart = CartService.get_cart(str(user.id))
    recent_orders_qs = orders.order_by('-created_at')[:10]
    recent_orders = [_serialize_order_summary(order) for order in recent_orders_qs]

    recent_payments = (
        Payment.objects.filter(order__organisation_id=org_id)
        .select_related('order')
        .order_by('-initiated_at')[:5]
    )
    recent_payments_data = [
        {
            'id': str(payment.id),
            'order_id': str(payment.order_id),
            'amount': str(payment.amount),
            'currency': payment.currency,
            'status': payment.status,
            'gateway': payment.gateway,
            'initiated_at': payment.initiated_at.isoformat(),
        }
        for payment in recent_payments
    ]

    top_suppliers = (
        orders.values('supplier__organisation__name')
        .annotate(
            order_count=Count('id'),
            total_spent=Sum('total_amount'),
        )
        .order_by('-total_spent')[:5]
    )
    top_suppliers_data = [
        {
            'supplier_name': row['supplier__organisation__name'] or 'Unknown',
            'order_count': row['order_count'],
            'total_spent': str(row['total_spent'] or Decimal('0.00')),
        }
        for row in top_suppliers
    ]

    recent_products = (
        OrderItem.objects.filter(order__organisation_id=org_id)
        .select_related('product', 'order')
        .order_by('-order__created_at')[:10]
    )
    recent_products_ordered = [
        {
            'product_id': str(item.product_id),
            'product_name': item.product.name,
            'quantity': item.quantity_ordered,
            'order_id': str(item.order_id),
            'ordered_at': item.order.created_at.isoformat(),
        }
        for item in recent_products
    ]

    return {
        'total_orders': total_orders,
        'pending_orders': pending_orders,
        'delivered_orders': delivered_orders,
        'monthly_spending': str(monthly_spending),
        'currency': 'TZS',
        'cart_items': cart.get('item_count', 0),
        'recent_orders': recent_orders,
        'recent_payments': recent_payments_data,
        'status_breakdown': _status_breakdown(orders),
        'spending_overview': _spending_by_month(orders),
        'recent_products_ordered': recent_products_ordered,
        'top_suppliers': top_suppliers_data,
        'quick_stats': {
            'active_orders': pending_orders,
            'cart_subtotal': cart.get('subtotal', '0.00'),
        },
    }


def _product_stock_total(product: Product) -> int:
    return sum(batch.available_quantity for batch in product.batches.all())


def get_supplier_summary(user: CustomUser) -> dict:
    supplier = Supplier.objects.filter(
        organisation_id=user.organisation_id,
    ).first()

    if supplier is None:
        return {
            'supplier_id': None,
            'total_products': 0,
            'active_products': 0,
            'low_stock_products': 0,
            'total_orders_received': 0,
            'pending_orders': 0,
            'total_revenue': '0.00',
            'currency': 'TZS',
            'my_products': [],
            'recent_orders': [],
            'inventory_status': [],
            'low_stock_alerts': [],
            'sales_summary': [],
            'product_performance': [],
            'quick_stats': {},
        }

    products = Product.objects.filter(supplier=supplier).prefetch_related('batches')
    orders = Order.objects.filter(supplier=supplier).select_related(
        'organisation',
        'buyer',
    )

    total_products = products.count()
    active_products = products.filter(is_active=True).count()

    low_stock_alerts = []
    inventory_status = []
    for product in products:
        stock = _product_stock_total(product)
        inventory_status.append({
            'product_id': str(product.id),
            'product_name': product.name,
            'stock': stock,
            'is_active': product.is_active,
            'price': str(product.price),
        })
        if stock < LOW_STOCK_THRESHOLD:
            low_stock_alerts.append({
                'product_id': str(product.id),
                'product_name': product.name,
                'stock': stock,
                'threshold': LOW_STOCK_THRESHOLD,
            })

    low_stock_products = len(low_stock_alerts)
    total_orders_received = orders.count()
    pending_orders = orders.filter(status__in=PENDING_STATUSES).count()
    total_revenue = (
        orders.filter(status=Order.Status.DELIVERED).aggregate(
            total=Sum('total_amount'),
        )['total']
        or Decimal('0.00')
    )

    my_products = [
        {
            'id': str(product.id),
            'name': product.name,
            'price': str(product.price),
            'currency': product.currency,
            'is_active': product.is_active,
            'stock': _product_stock_total(product),
            'unit_of_measure': product.unit_of_measure,
        }
        for product in products.order_by('-updated_at')[:10]
    ]

    recent_orders = [
        _serialize_order_summary(order)
        for order in orders.order_by('-created_at')[:10]
    ]

    product_performance = (
        OrderItem.objects.filter(order__supplier=supplier)
        .values('product__name', 'product_id')
        .annotate(
            units_sold=Sum('quantity_ordered'),
            revenue=Sum('subtotal'),
        )
        .order_by('-revenue')[:5]
    )
    product_performance_data = [
        {
            'product_id': str(row['product_id']),
            'product_name': row['product__name'],
            'units_sold': row['units_sold'] or 0,
            'revenue': str(row['revenue'] or Decimal('0.00')),
        }
        for row in product_performance
    ]

    return {
        'supplier_id': str(supplier.id),
        'total_products': total_products,
        'active_products': active_products,
        'low_stock_products': low_stock_products,
        'total_orders_received': total_orders_received,
        'pending_orders': pending_orders,
        'total_revenue': str(total_revenue),
        'currency': 'TZS',
        'my_products': my_products,
        'recent_orders': recent_orders,
        'inventory_status': inventory_status[:20],
        'low_stock_alerts': low_stock_alerts,
        'sales_summary': _spending_by_month(orders),
        'product_performance': product_performance_data,
        'quick_stats': {
            'verified': supplier.verification_status == Supplier.VerificationStatus.VERIFIED,
        },
    }


def get_admin_summary(user: CustomUser) -> dict:
    users = CustomUser.objects.select_related('organisation')
    organisations = Organisation.objects.all()
    products = Product.objects.select_related('supplier', 'supplier__organisation')
    orders = Order.objects.select_related('supplier__organisation', 'organisation')
    payments = Payment.objects.select_related('order')

    total_users = users.count()
    total_hospitals = organisations.filter(type=Organisation.Type.HOSPITAL).count()
    total_suppliers = organisations.filter(type=Organisation.Type.SUPPLIER).count()
    pending_verifications = Supplier.objects.filter(
        verification_status=Supplier.VerificationStatus.PENDING,
    ).count()
    total_products = products.count()
    total_orders = orders.count()
    platform_revenue = (
        payments.filter(status=Payment.Status.COMPLETED).aggregate(
            total=Sum('amount'),
        )['total']
        or Decimal('0.00')
    )

    recent_users = [
        {
            'id': str(u.id),
            'email': u.email,
            'full_name': u.full_name,
            'role': u.role,
            'organisation_name': u.organisation.name if u.organisation else None,
            'created_at': u.created_at.isoformat(),
        }
        for u in users.order_by('-created_at')[:10]
    ]

    recent_orders = [
        _serialize_order_summary(order)
        for order in orders.order_by('-created_at')[:10]
    ]

    verification_requests = [
        {
            'id': str(supplier.id),
            'organisation_name': supplier.organisation.name,
            'verification_status': supplier.verification_status,
            'created_at': supplier.created_at.isoformat(),
        }
        for supplier in Supplier.objects.filter(
            verification_status=Supplier.VerificationStatus.PENDING,
        )
        .select_related('organisation')
        .order_by('created_at')[:10]
    ]

    product_activity = [
        {
            'id': str(product.id),
            'name': product.name,
            'supplier_name': product.supplier.organisation.name,
            'is_active': product.is_active,
            'updated_at': product.updated_at.isoformat(),
        }
        for product in products.order_by('-updated_at')[:10]
    ]

    activity_logs = [
        {
            'id': str(log.id),
            'action': log.action,
            'user_email': log.user.email if log.user else None,
            'created_at': log.created_at.isoformat(),
        }
        for log in AuditLog.objects.select_related('user').order_by('-created_at')[:10]
    ]

    return {
        'total_users': total_users,
        'total_hospitals': total_hospitals,
        'total_suppliers': total_suppliers,
        'pending_verifications': pending_verifications,
        'total_products': total_products,
        'total_orders': total_orders,
        'platform_revenue': str(platform_revenue),
        'currency': 'TZS',
        'recent_users': recent_users,
        'recent_orders': recent_orders,
        'verification_requests': verification_requests,
        'product_activity': product_activity,
        'revenue_overview': _spending_by_month(orders),
        'activity_logs': activity_logs,
        'quick_stats': {
            'active_products': products.filter(is_active=True).count(),
            'pending_orders': orders.filter(status=Order.Status.PENDING).count(),
        },
    }
