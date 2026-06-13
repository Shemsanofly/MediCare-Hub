"""Analytics URL configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from analytics.views import AnalyticsViewSet

app_name = 'analytics'

router = DefaultRouter()
router.register('analytics', AnalyticsViewSet, basename='analytics')

urlpatterns = [
    path('', include(router.urls)),
]
