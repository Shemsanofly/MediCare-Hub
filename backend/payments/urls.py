"""Payments URL configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from payments.views import (
    AirtelWebhookView,
    MpesaWebhookView,
    PaymentViewSet,
    SelcomWebhookView,
)

app_name = 'payments'

router = DefaultRouter()
router.register('payments', PaymentViewSet, basename='payment')

urlpatterns = [
    path('webhooks/mpesa/', MpesaWebhookView.as_view(), name='webhook-mpesa'),
    path('webhooks/selcom/', SelcomWebhookView.as_view(), name='webhook-selcom'),
    path('webhooks/airtel/', AirtelWebhookView.as_view(), name='webhook-airtel'),
    path('', include(router.urls)),
]
