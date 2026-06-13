"""Payments serializers."""

from rest_framework import serializers

from payments.constants import SUPPORTED_GATEWAYS


class InitiatePaymentSerializer(serializers.Serializer):
    """Input for initiating a payment against an order."""

    order_id = serializers.UUIDField()
    payment_method = serializers.ChoiceField(choices=[(g, g) for g in SUPPORTED_GATEWAYS])
    phone = serializers.CharField(max_length=20)


class PaymentSerializer(serializers.Serializer):
    """Payment record output."""

    id = serializers.UUIDField()
    order_id = serializers.UUIDField()
    gateway = serializers.CharField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField()
    transaction_reference = serializers.CharField()
    gateway_reference = serializers.CharField()
    status = serializers.CharField()
    initiated_at = serializers.DateTimeField()
    completed_at = serializers.DateTimeField(allow_null=True)
