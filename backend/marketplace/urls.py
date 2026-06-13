"""Marketplace URL configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from marketplace.batch_views import ProductBatchDetailView, ProductBatchListCreateView
from marketplace.views import ProductViewSet

app_name = 'marketplace'

router = DefaultRouter()
router.register('products', ProductViewSet, basename='product')

urlpatterns = [
    path(
        'products/<uuid:product_id>/batches/',
        ProductBatchListCreateView.as_view(),
        name='product-batches',
    ),
    path(
        'batches/<uuid:pk>/',
        ProductBatchDetailView.as_view(),
        name='batch-detail',
    ),
    path('', include(router.urls)),
]
