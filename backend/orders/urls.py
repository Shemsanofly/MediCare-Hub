"""Orders URL configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from orders.views import CartView, CheckoutView, OrderViewSet
from orders.workflow_views import (
    OrderAcceptView,
    OrderCompleteView,
    OrderDeliverView,
    OrderPrepareView,
    OrderRejectView,
    OrderShipView,
)

app_name = 'orders'

router = DefaultRouter()
router.register('orders', OrderViewSet, basename='order')

urlpatterns = [
    path('cart/', CartView.as_view(), name='cart'),
    path('checkout/', CheckoutView.as_view(), name='checkout'),
    path('<uuid:pk>/accept/', OrderAcceptView.as_view(), name='order-accept'),
    path('<uuid:pk>/reject/', OrderRejectView.as_view(), name='order-reject'),
    path('<uuid:pk>/prepare/', OrderPrepareView.as_view(), name='order-prepare'),
    path('<uuid:pk>/ship/', OrderShipView.as_view(), name='order-ship'),
    path('<uuid:pk>/deliver/', OrderDeliverView.as_view(), name='order-deliver'),
    path('<uuid:pk>/complete/', OrderCompleteView.as_view(), name='order-complete'),
    path('', include(router.urls)),
]
