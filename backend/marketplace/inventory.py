"""Inventory reservation, FIFO allocation, and batch status helpers."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from marketplace.models import Product, ProductBatch
from orders.errors import CheckoutError

if TYPE_CHECKING:
    from orders.models import Order, OrderItem

LOW_STOCK_THRESHOLD = 50


@dataclass
class BatchAllocation:
    batch: ProductBatch
    quantity: int


def compute_batch_status(batch: ProductBatch) -> str:
    """Derive batch status from expiry and available quantity."""
    today = timezone.now().date()
    if batch.expiry_date < today:
        return ProductBatch.Status.EXPIRED
    available = batch.available_quantity
    if available <= 0:
        return ProductBatch.Status.OUT_OF_STOCK
    if available < LOW_STOCK_THRESHOLD:
        return ProductBatch.Status.LOW_STOCK
    return ProductBatch.Status.ACTIVE


def product_available_quantity(product: Product) -> int:
    """Sum non-expired available units across all batches."""
    today = timezone.now().date()
    total = 0
    for batch in product.batches.filter(expiry_date__gt=today):
        total += batch.available_quantity
    return total


def get_fifo_batches(product: Product, *, for_update: bool = False):
    """Return sellable batches ordered by nearest expiry first."""
    queryset = ProductBatch.objects.filter(
        product=product,
        expiry_date__gt=timezone.now().date(),
    ).order_by('expiry_date')
    if for_update:
        queryset = queryset.select_for_update()
    return [batch for batch in queryset if batch.available_quantity > 0]


def allocate_fifo(product: Product, quantity: int) -> list[BatchAllocation]:
    """Allocate quantity across batches using FIFO (nearest expiry first)."""
    allocations: list[BatchAllocation] = []
    remaining = quantity

    for batch in get_fifo_batches(product):
        if remaining <= 0:
            break
        take = min(batch.available_quantity, remaining)
        if take <= 0:
            continue
        allocations.append(BatchAllocation(batch=batch, quantity=take))
        remaining -= take

    if remaining > 0:
        raise CheckoutError(
            f'Insufficient stock for {product.name}.',
            code='INSUFFICIENT_STOCK',
        )

    return allocations


def allocate_specific_batch(
    product: Product,
    batch_id: str,
    quantity: int,
) -> list[BatchAllocation]:
    """Allocate quantity from a specific batch."""
    try:
        batch = ProductBatch.objects.select_for_update().get(
            pk=batch_id,
            product=product,
        )
    except ProductBatch.DoesNotExist as exc:
        raise CheckoutError(
            'Batch not found for this product.',
            code='BATCH_NOT_FOUND',
        ) from exc

    if batch.expiry_date <= timezone.now().date():
        raise CheckoutError(
            f'Batch {batch.batch_number} has expired.',
            code='BATCH_EXPIRED',
        )

    if batch.available_quantity < quantity:
        raise CheckoutError(
            f'Insufficient stock for {product.name}.',
            code='INSUFFICIENT_STOCK',
        )

    return [BatchAllocation(batch=batch, quantity=quantity)]


def reserve_allocations(
    *,
    order: Order,
    order_item: OrderItem | None,
    allocations: list[BatchAllocation],
) -> None:
    """Reserve stock for an order against one or more batches."""
    from orders.models import BatchReservation

    for allocation in allocations:
        batch = ProductBatch.objects.select_for_update().get(pk=allocation.batch.pk)
        if batch.available_quantity < allocation.quantity:
            raise CheckoutError(
                f'Insufficient stock for batch {batch.batch_number}.',
                code='INSUFFICIENT_STOCK',
            )

        batch.reserved_quantity += allocation.quantity
        batch.save(update_fields=['reserved_quantity', 'updated_at'])

        BatchReservation.objects.create(
            order=order,
            order_item=order_item,
            batch=batch,
            quantity=allocation.quantity,
        )


def release_order_reservations(order: Order) -> None:
    """Release reserved stock when an order is cancelled or rejected."""
    from orders.models import BatchReservation

    with transaction.atomic():
        reservations = (
            BatchReservation.objects.select_for_update()
            .filter(order=order, is_released=False, is_fulfilled=False)
            .select_related('batch')
        )
        for reservation in reservations:
            batch = ProductBatch.objects.select_for_update().get(pk=reservation.batch_id)
            batch.reserved_quantity = max(
                0,
                batch.reserved_quantity - reservation.quantity,
            )
            batch.save(update_fields=['reserved_quantity'])
            reservation.is_released = True
            reservation.save(update_fields=['is_released'])


def fulfill_order_reservations(order: Order) -> None:
    """Deduct reserved stock when an order is completed."""
    from orders.models import BatchReservation

    with transaction.atomic():
        reservations = (
            BatchReservation.objects.select_for_update()
            .filter(order=order, is_released=False, is_fulfilled=False)
            .select_related('batch')
        )
        for reservation in reservations:
            batch = ProductBatch.objects.select_for_update().get(pk=reservation.batch_id)
            if batch.reserved_quantity < reservation.quantity:
                raise CheckoutError(
                    f'Reservation mismatch for batch {batch.batch_number}.',
                    code='RESERVATION_MISMATCH',
                )
            if batch.quantity < reservation.quantity:
                raise CheckoutError(
                    f'Insufficient on-hand stock for batch {batch.batch_number}.',
                    code='INSUFFICIENT_STOCK',
                )

            batch.quantity -= reservation.quantity
            batch.reserved_quantity -= reservation.quantity
            batch.save(update_fields=['quantity', 'reserved_quantity'])

            reservation.is_fulfilled = True
            reservation.save(update_fields=['is_fulfilled'])
