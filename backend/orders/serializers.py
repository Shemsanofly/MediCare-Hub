"""Orders serializers."""

from decimal import Decimal

from rest_framework import serializers

from orders.models import Order


class CartAddItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    batch_id = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1)


class CartRemoveItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()


class CheckoutSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    payment_terms = serializers.ChoiceField(
        choices=Order.PaymentTerms.choices,
        default=Order.PaymentTerms.IMMEDIATE,
    )
    delivery_fee = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        min_value=Decimal('0'),
    )
    tax_amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        min_value=Decimal('0'),
    )
    lpo_number = serializers.CharField(required=False, allow_blank=True, default='')


class OrderTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices)
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class OrderRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=10, max_length=2000)
