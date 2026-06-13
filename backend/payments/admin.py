from django.contrib import admin

from payments.models import EscrowAccount, Payment, PayoutTransaction, WebhookLog


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'order',
        'gateway',
        'amount',
        'currency',
        'status',
        'transaction_reference',
        'initiated_at',
    )
    list_filter = ('gateway', 'status', 'currency')
    search_fields = ('transaction_reference', 'gateway_reference', 'order__id')
    readonly_fields = ('id', 'initiated_at', 'completed_at')


@admin.register(WebhookLog)
class WebhookLogAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'gateway',
        'processing_status',
        'signature_verified',
        'ip_address',
        'received_at',
        'processed_at',
    )
    list_filter = ('gateway', 'processing_status', 'signature_verified')
    readonly_fields = ('id', 'received_at', 'processed_at')


@admin.register(EscrowAccount)
class EscrowAccountAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'order',
        'amount_held',
        'status',
        'release_trigger',
        'held_at',
        'released_at',
    )
    list_filter = ('status', 'release_trigger')


@admin.register(PayoutTransaction)
class PayoutTransactionAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'order',
        'supplier',
        'amount',
        'currency',
        'status',
        'created_at',
    )
    list_filter = ('status', 'currency')
