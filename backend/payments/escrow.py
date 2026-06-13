"""Escrow payment holding and release logic."""

from __future__ import annotations

import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from orders.models import GoodsReceivedNote, Order
from payments.errors import PaymentError
from payments.models import EscrowAccount, Payment, PayoutTransaction

logger = logging.getLogger(__name__)


class EscrowService:
    """Manages escrow holding, release, auto-release, and disputes."""

    @classmethod
    def hold_payment(cls, order: Order, payment: Payment) -> EscrowAccount:
        """Create escrow account and notify supplier that payment is secured."""
        if payment.status != Payment.Status.COMPLETED:
            raise PaymentError(
                'Cannot hold escrow for incomplete payment.',
                code='PAYMENT_NOT_COMPLETED',
            )

        with transaction.atomic():
            escrow, created = EscrowAccount.objects.get_or_create(
                order=order,
                defaults={
                    'payment': payment,
                    'amount_held': payment.amount,
                    'status': EscrowAccount.Status.HOLDING,
                },
            )
            if not created and escrow.status != EscrowAccount.Status.HOLDING:
                return escrow

        from payments.tasks import notify_supplier_payment_secured

        transaction.on_commit(
            lambda: notify_supplier_payment_secured.delay(str(order.id))
        )

        logger.info(
            'Escrow funds held',
            extra={
                'order_id': str(order.id),
                'escrow_id': str(escrow.id),
                'amount': str(escrow.amount_held),
            },
        )
        return escrow

    @classmethod
    def release_payment(cls, order: Order, grn: GoodsReceivedNote) -> PayoutTransaction:
        """Release escrow to supplier after GRN is complete and signed."""
        if not grn.is_complete:
            raise PaymentError(
                'GRN must be marked complete before release.',
                code='GRN_INCOMPLETE',
            )
        if not grn.signature_data:
            raise PaymentError(
                'GRN must be signed before release.',
                code='GRN_UNSIGNED',
            )

        with transaction.atomic():
            escrow = (
                EscrowAccount.objects.select_for_update()
                .filter(order=order)
                .first()
            )
            if escrow is None:
                raise PaymentError('No escrow account for this order.', code='NO_ESCROW')

            if escrow.status == EscrowAccount.Status.FROZEN:
                raise PaymentError(
                    'Escrow is frozen due to dispute.',
                    code='ESCROW_FROZEN',
                )
            if escrow.status == EscrowAccount.Status.RELEASED:
                existing = escrow.payouts.filter(
                    status=PayoutTransaction.Status.COMPLETED
                ).first()
                if existing:
                    return existing
                raise PaymentError('Escrow already released.', code='ALREADY_RELEASED')

            payout = PayoutTransaction.objects.create(
                escrow_account=escrow,
                order=order,
                supplier=order.supplier,
                amount=escrow.amount_held,
                currency=order.currency,
                status=PayoutTransaction.Status.COMPLETED,
                gateway_reference=f'PAYOUT-{order.id}',
                completed_at=timezone.now(),
            )

            escrow.status = EscrowAccount.Status.RELEASED
            escrow.release_trigger = EscrowAccount.ReleaseTrigger.GRN_SIGNED
            escrow.released_at = timezone.now()
            escrow.save()

        from payments.tasks import notify_escrow_released

        transaction.on_commit(
            lambda: notify_escrow_released.delay(
                str(order.id),
                EscrowAccount.ReleaseTrigger.GRN_SIGNED,
            )
        )

        logger.info(
            'Escrow released via GRN',
            extra={'order_id': str(order.id), 'payout_id': str(payout.id)},
        )
        return payout

    @classmethod
    def auto_release(cls, order: Order) -> PayoutTransaction | None:
        """
        Auto-release escrow 72 hours after SHIPPED if no signed GRN.

        Called by Celery scheduled task.
        """
        signed_grn = order.goods_received_notes.filter(
            is_complete=True,
        ).exclude(signature_data='').exists()
        if signed_grn:
            logger.info(
                'Auto-release skipped — signed GRN exists',
                extra={'order_id': str(order.id)},
            )
            return None

        if order.status not in (Order.Status.SHIPPED, Order.Status.DELIVERED):
            logger.info(
                'Auto-release skipped — order not shipped',
                extra={'order_id': str(order.id), 'status': order.status},
            )
            return None

        with transaction.atomic():
            escrow = (
                EscrowAccount.objects.select_for_update()
                .filter(order=order, status=EscrowAccount.Status.HOLDING)
                .first()
            )
            if escrow is None:
                return None

            payout = PayoutTransaction.objects.create(
                escrow_account=escrow,
                order=order,
                supplier=order.supplier,
                amount=escrow.amount_held,
                currency=order.currency,
                status=PayoutTransaction.Status.COMPLETED,
                gateway_reference=f'AUTO-PAYOUT-{order.id}',
                completed_at=timezone.now(),
            )

            escrow.status = EscrowAccount.Status.RELEASED
            escrow.release_trigger = EscrowAccount.ReleaseTrigger.AUTO_RELEASE
            escrow.released_at = timezone.now()
            escrow.save()

        from payments.tasks import notify_escrow_released

        notify_escrow_released.delay(
            str(order.id),
            EscrowAccount.ReleaseTrigger.AUTO_RELEASE,
        )

        logger.info(
            'Escrow auto-released after 72h',
            extra={'order_id': str(order.id), 'payout_id': str(payout.id)},
        )
        return payout

    @classmethod
    def raise_dispute(cls, order: Order, reason: str) -> EscrowAccount:
        """Freeze escrow funds and notify admin for manual resolution."""
        with transaction.atomic():
            escrow = (
                EscrowAccount.objects.select_for_update()
                .filter(order=order)
                .first()
            )
            if escrow is None:
                raise PaymentError('No escrow account for this order.', code='NO_ESCROW')

            if escrow.status == EscrowAccount.Status.RELEASED:
                raise PaymentError(
                    'Cannot dispute — funds already released.',
                    code='ALREADY_RELEASED',
                )

            escrow.status = EscrowAccount.Status.FROZEN
            escrow.release_trigger = EscrowAccount.ReleaseTrigger.DISPUTE
            escrow.dispute_reason = reason
            escrow.save()

        from payments.tasks import notify_admin_dispute

        transaction.on_commit(
            lambda: notify_admin_dispute.delay(str(order.id), reason)
        )

        logger.info(
            'Escrow frozen due to dispute',
            extra={'order_id': str(order.id), 'reason': reason},
        )
        return escrow
