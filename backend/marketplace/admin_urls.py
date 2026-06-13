"""Admin API URL configuration for marketplace."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from marketplace.views import SupplierVerificationViewSet

app_name = 'marketplace_admin'

router = DefaultRouter()
router.register('', SupplierVerificationViewSet, basename='supplier')

urlpatterns = [
    path('', include(router.urls)),
]
