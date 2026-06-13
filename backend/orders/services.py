"""Business logic for cart management and order checkout."""

from __future__ import annotations

import json
import logging
import uuid
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.core.cache import caches
from django.db import transaction
from django.utils import timezone

from authentication.models import CustomUser
from marketplace.inventory import (
    allocate_fifo,
    allocate_specific_batch,
    product_available_quantity,
    reserve_allocations,
)
from marketplace.models import Product, ProductBatch, Supplier
from orders.constants import (
    CART_REDIS_KEY_PREFIX,
    CART_TTL_SECONDS,
    PAYMENT_INSTRUCTIONS,
)
from orders.errors import CartError, CheckoutError
from orders.models import Order, OrderItem

logger = logging.getLogger(__name__)


def _cart_key(user_id: str) -> str:
    return f'{CART_REDIS_KEY_PREFIX}:{user_id}'


def _get_redis_client():
    """Return the underlying Redis client when using RedisCache."""
    cache = caches['default']
    if hasattr(cache, '_cache') and hasattr(cache._cache, 'get_client'):
        return cache._cache.get_client(write=True)
    return None


class CartService:
    """Redis-backed shopping cart (hash per user, 24-hour TTL)."""

    @classmethod
    def add_item(
        cls,
        user_id: str,
        product_id: str,
        batch_id: str | None,
        quantity: int,
    ) -> dict[str, Any]:
        if quantity < 1:
            raise CartError('Quantity must be at least 1.', code='INVALID_QUANTITY')

        try:
            product_uuid = uuid.UUID(str(product_id))
        except ValueError as exc:
            raise CartError('Invalid product ID.', code='INVALID_PRODUCT') from exc

        product = (
            Product.objects.select_related('supplier', 'supplier__organisation')
            .filter(pk=product_uuid, is_active=True)
            .first()
        )
        if product is None:
            raise CartError('Product not found or inactive.', code='PRODUCT_NOT_FOUND')

        supplier = product.supplier
        if supplier.verification_status != Supplier.VerificationStatus.VERIFIED:
            raise CartError(
                'Product supplier is not verified.',
                code='SUPPLIER_NOT_VERIFIED',
            )

        batch = None
        if batch_id:
            try:
                batch_uuid = uuid.UUID(str(batch_id))
            except ValueError as exc:
                raise CartError('Invalid batch ID.', code='INVALID_BATCH') from exc

            batch = ProductBatch.objects.filter(
                pk=batch_uuid,
                product=product,
            ).first()
            if batch is None:
                raise CartError(
                    'Batch not found for this product.',
                    code='BATCH_NOT_FOUND',
                )
            if batch.expiry_date <= timezone.now().date():
                raise CartError(
                    'Cannot add expired batch to cart.',
                    code='BATCH_EXPIRED',
                )
            if batch.available_quantity < quantity:
                raise CartError(
                    f'Insufficient stock. Only {batch.available_quantity} available.',
                    code='INSUFFICIENT_STOCK',
                )
        else:
            available = product_available_quantity(product)
            if available < quantity:
                raise CartError(
                    f'Insufficient stock. Only {available} available.',
                    code='INSUFFICIENT_STOCK',
                )
            non_expired_batches = product.batches.filter(
                expiry_date__gt=timezone.now().date(),
            )
            if not any(batch.available_quantity > 0 for batch in non_expired_batches):
                raise CartError(
                    'No non-expired stock available for this product.',
                    code='BATCH_EXPIRED',
                )

        if quantity < product.minimum_order_quantity:
            raise CartError(
                f'Minimum order quantity is {product.minimum_order_quantity}.',
                code='BELOW_MINIMUM_ORDER',
            )

        payload = json.dumps(
            {
                'product_id': str(product.id),
                'batch_id': str(batch.id) if batch else None,
                'quantity': quantity,
            }
        )

        redis_client = _get_redis_client()
        key = _cart_key(str(user_id))
        field = str(product.id)

        if redis_client is not None:
            redis_client.hset(key, field, payload)
            redis_client.expire(key, CART_TTL_SECONDS)
        else:
            cart_data = caches['default'].get(key) or {}
            cart_data[field] = payload
            caches['default'].set(key, cart_data, timeout=CART_TTL_SECONDS)

        return cls.get_cart(user_id)

    @classmethod
    def remove_item(cls, user_id: str, product_id: str) -> dict[str, Any]:
        redis_client = _get_redis_client()
        key = _cart_key(str(user_id))
        field = str(product_id)

        if redis_client is not None:
            redis_client.hdel(key, field)
        else:
            cart_data = caches['default'].get(key) or {}
            cart_data.pop(field, None)
            if cart_data:
                caches['default'].set(key, cart_data, timeout=CART_TTL_SECONDS)
            else:
                caches['default'].delete(key)

        return cls.get_cart(user_id)

    @classmethod
    def get_cart(cls, user_id: str) -> dict[str, Any]:
        redis_client = _get_redis_client()
        key = _cart_key(str(user_id))
        raw_items: dict[str, str] = {}

        if redis_client is not None:
            raw_items = redis_client.hgetall(key) or {}
            if raw_items and isinstance(next(iter(raw_items)), bytes):
                raw_items = {
                    key.decode(): value.decode()
                    for key, value in raw_items.items()
                }
        else:
            stored = caches['default'].get(key) or {}
            raw_items = stored if isinstance(stored, dict) else {}

        if not raw_items:
            return {'items': [], 'item_count': 0, 'subtotal': '0.00', 'currency': 'TZS'}

        parsed_items: list[dict[str, Any]] = []
        product_ids: list[uuid.UUID] = []

        for raw_value in raw_items.values():
            item = json.loads(raw_value)
            parsed_items.append(item)
            product_ids.append(uuid.UUID(item['product_id']))

        products = {
            str(product.id): product
            for product in Product.objects.filter(id__in=product_ids)
            .select_related('supplier', 'supplier__organisation')
            .prefetch_related('batches')
        }

        batch_ids = [
            uuid.UUID(item['batch_id'])
            for item in parsed_items
            if item.get('batch_id')
        ]
        batches = {}
        if batch_ids:
            batches = {
                str(batch.id): batch
                for batch in ProductBatch.objects.filter(id__in=batch_ids)
            }

        today = timezone.now().date()
        cart_items: list[dict[str, Any]] = []
        subtotal = Decimal('0.00')
        currency = 'TZS'

        for item in parsed_items:
            product = products.get(item['product_id'])
            if product is None:
                continue

            currency = product.currency
            batch = batches.get(item['batch_id']) if item.get('batch_id') else None
            quantity = int(item['quantity'])
            unit_price = product.price
            line_subtotal = unit_price * quantity
            subtotal += line_subtotal

            if batch is not None:
                stock_available = batch.available_quantity
                is_expired = batch.expiry_date <= today
            else:
                stock_available = product_available_quantity(product)
                is_expired = stock_available <= 0

            cart_items.append(
                {
                    'product_id': str(product.id),
                    'product_name': product.name,
                    'batch_id': item.get('batch_id'),
                    'batch_number': batch.batch_number if batch else None,
                    'quantity': quantity,
                    'unit_price': str(unit_price),
                    'subtotal': str(line_subtotal),
                    'currency': product.currency,
                    'supplier_id': str(product.supplier_id),
                    'supplier_name': product.supplier.organisation.name,
                    'stock_available': stock_available,
                    'in_stock': stock_available >= quantity and not is_expired,
                    'is_expired': is_expired,
                    'minimum_order_quantity': product.minimum_order_quantity,
                }
            )

        return {
            'items': cart_items,
            'item_count': len(cart_items),
            'subtotal': str(subtotal),
            'currency': currency,
        }

    @classmethod
    def clear_cart(cls, user_id: str) -> None:
        redis_client = _get_redis_client()
        key = _cart_key(str(user_id))

        if redis_client is not None:
            redis_client.delete(key)
        else:
            caches['default'].delete(key)


class CheckoutService:
    """Atomic checkout flow from Redis cart to persisted order."""

    @classmethod
    def checkout(
        cls,
        user: CustomUser,
        *,
        notes: str = '',
        payment_terms: str = Order.PaymentTerms.IMMEDIATE,
        delivery_fee: Decimal | None = None,
        tax_amount: Decimal | None = None,
        lpo_number: str = '',
    ) -> dict[str, Any]:
        if user.organisation_id is None:
            raise CheckoutError(
                'User must belong to a hospital organisation to checkout.',
                code='NO_ORGANISATION',
            )

        cart = CartService.get_cart(str(user.id))
        if not cart['items']:
            raise CheckoutError('Cart is empty.', code='EMPTY_CART')

        out_of_stock = [item for item in cart['items'] if not item['in_stock']]
        if out_of_stock:
            raise CheckoutError(
                'Some cart items are out of stock or expired.',
                code='STOCK_UNAVAILABLE',
            )

        supplier_ids = {item['supplier_id'] for item in cart['items']}
        if len(supplier_ids) > 1:
            raise CheckoutError(
                'All cart items must be from the same supplier.',
                code='MULTIPLE_SUPPLIERS',
            )

        delivery_fee = delivery_fee if delivery_fee is not None else Decimal('0.00')
        tax_amount = tax_amount if tax_amount is not None else Decimal('0.00')
        subtotal = Decimal(cart['subtotal'])
        total_amount = subtotal + delivery_fee + tax_amount

        try:
            with transaction.atomic():
                order = cls._create_order(
                    user=user,
                    cart_items=cart['items'],
                    subtotal=subtotal,
                    delivery_fee=delivery_fee,
                    tax_amount=tax_amount,
                    total_amount=total_amount,
                    currency=cart['currency'],
                    notes=notes,
                    payment_terms=payment_terms,
                    lpo_number=lpo_number,
                )

                from orders.tasks import send_order_confirmation_email

                user_id = str(user.id)
                order_id = str(order.id)
                transaction.on_commit(lambda: CartService.clear_cart(user_id))
                transaction.on_commit(
                    lambda: send_order_confirmation_email.delay(order_id)
                )
        except CheckoutError:
            raise
        except Exception as exc:
            logger.exception(
                'Checkout failed — transaction rolled back, cart preserved',
                extra={'user_id': str(user.id)},
            )
            raise CheckoutError(
                'Checkout failed. Your cart has been preserved.',
                code='CHECKOUT_FAILED',
            ) from exc

        payment_instructions = PAYMENT_INSTRUCTIONS.get(
            payment_terms,
            PAYMENT_INSTRUCTIONS['IMMEDIATE'],
        )

        return {
            'order': cls._serialize_order(order),
            'payment_instructions': payment_instructions,
        }

    @classmethod
    def approve_next_step(cls, order: Order, user: CustomUser) -> Order:
        """Approve the next pending approval step for an order."""
        from django.utils import timezone as tz

        from orders.errors import OrderTransitionError
        from orders.models import ApprovalStep
        from orders.state_machine import OrderStateManager

        if order.status != Order.Status.PENDING:
            raise OrderTransitionError(
                'Approval steps can only be actioned on pending orders.',
                code='INVALID_ORDER_STATUS',
            )

        pending_step = (
            order.approval_steps.filter(status=ApprovalStep.Status.PENDING)
            .order_by('step_number')
            .first()
        )

        if pending_step is None:
            return OrderStateManager.transition(
                order,
                Order.Status.APPROVED,
                user,
                reason='All approval requirements met.',
            )

        cls._assert_can_approve_step(pending_step, user)

        with transaction.atomic():
            pending_step = ApprovalStep.objects.select_for_update().get(pk=pending_step.pk)
            pending_step.status = ApprovalStep.Status.APPROVED
            pending_step.approver = user
            pending_step.approved_at = tz.now()
            pending_step.save(
                update_fields=['status', 'approver', 'approved_at'],
            )

            order.refresh_from_db()

        if order.all_approvals_complete:
            return OrderStateManager.transition(
                order,
                Order.Status.APPROVED,
                user,
                reason='All approval steps completed.',
            )

        order.refresh_from_db()
        return order

    @classmethod
    def _assert_can_approve_step(cls, step, user: CustomUser) -> None:
        from orders.errors import OrderTransitionError

        if user.role == CustomUser.Role.ADMIN:
            return

        if user.role != CustomUser.Role.HOSPITAL:
            raise OrderTransitionError(
                f'Only hospital approvers can approve {step.required_role} steps.',
                code='PERMISSION_DENIED',
            )

        if not user.can_approve_procurement(step.threshold_amount):
            raise OrderTransitionError(
                f'You do not have authority to approve {step.required_role} '
                f'for orders above {step.threshold_amount} TZS.',
                code='PERMISSION_DENIED',
            )

    @classmethod
    def _create_order(
        cls,
        *,
        user: CustomUser,
        cart_items: list[dict[str, Any]],
        subtotal: Decimal,
        delivery_fee: Decimal,
        tax_amount: Decimal,
        total_amount: Decimal,
        currency: str,
        notes: str,
        payment_terms: str,
        lpo_number: str,
    ) -> Order:
        supplier = Supplier.objects.select_related('organisation').get(
            pk=cart_items[0]['supplier_id'],
        )

        order = Order(
            buyer=user,
            organisation=user.organisation,
            supplier=supplier,
            status=Order.Status.PENDING,
            subtotal=subtotal,
            delivery_fee=delivery_fee,
            tax_amount=tax_amount,
            total_amount=total_amount,
            currency=currency,
            lpo_number=lpo_number,
            payment_terms=payment_terms,
            notes=notes,
        )
        order.save()

        for item in cart_items:
            product = Product.objects.select_for_update().get(pk=item['product_id'])
            quantity = int(item['quantity'])

            if item.get('batch_id'):
                allocations = allocate_specific_batch(
                    product,
                    item['batch_id'],
                    quantity,
                )
            else:
                allocations = allocate_fifo(product, quantity)

            unit_price = Decimal(item['unit_price'])
            order_item = OrderItem.objects.create(
                order=order,
                product=product,
                batch=allocations[0].batch,
                quantity_ordered=quantity,
                unit_price=unit_price,
                subtotal=unit_price * quantity,
            )
            reserve_allocations(
                order=order,
                order_item=order_item,
                allocations=allocations,
            )

        order.refresh_from_db()
        return order

    @classmethod
    def _serialize_order(cls, order: Order) -> dict[str, Any]:
        order = (
            Order.objects.select_related(
                'buyer',
                'organisation',
                'supplier',
                'supplier__organisation',
            )
            .prefetch_related(
                'items__product',
                'items__batch',
                'approval_steps',
                'status_history__changed_by',
            )
            .get(pk=order.pk)
        )

        return {
            'id': str(order.id),
            'status': order.status,
            'buyer_id': str(order.buyer_id),
            'organisation_id': str(order.organisation_id),
            'supplier_id': str(order.supplier_id),
            'supplier_name': order.supplier.organisation.name,
            'subtotal': str(order.subtotal),
            'delivery_fee': str(order.delivery_fee),
            'tax_amount': str(order.tax_amount),
            'total_amount': str(order.total_amount),
            'currency': order.currency,
            'lpo_number': order.lpo_number,
            'payment_terms': order.payment_terms,
            'notes': order.notes,
            'requires_approval': order.requires_approval,
            'approval_steps': [
                {
                    'id': str(step.id),
                    'step_number': step.step_number,
                    'required_role': step.required_role,
                    'status': step.status,
                    'threshold_amount': str(step.threshold_amount),
                }
                for step in order.approval_steps.all()
            ],
            'items': [
                {
                    'id': str(line.id),
                    'product_id': str(line.product_id),
                    'product_name': line.product.name,
                    'batch_id': str(line.batch_id) if line.batch_id else None,
                    'quantity_ordered': line.quantity_ordered,
                    'unit_price': str(line.unit_price),
                    'subtotal': str(line.subtotal),
                }
                for line in order.items.all()
            ],
            'created_at': order.created_at.isoformat(),
            'hospital_name': order.organisation.name,
            'status_history': [
                {
                    'id': str(entry.id),
                    'from_status': entry.from_status,
                    'to_status': entry.to_status,
                    'changed_by_email': entry.changed_by.email if entry.changed_by else None,
                    'changed_by_role': entry.changed_by.role if entry.changed_by else None,
                    'reason': entry.reason,
                    'created_at': entry.created_at.isoformat(),
                }
                for entry in order.status_history.order_by('created_at')
            ],
        }
