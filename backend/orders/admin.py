from django.contrib import admin

from orders.models import (
    ApprovalStep,
    GoodsReceivedNote,
    Order,
    OrderItem,
    OrderStatusHistory,
)

admin.site.register(Order)
admin.site.register(OrderItem)
admin.site.register(ApprovalStep)
admin.site.register(GoodsReceivedNote)
admin.site.register(OrderStatusHistory)
