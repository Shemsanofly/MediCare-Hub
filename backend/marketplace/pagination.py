"""Cursor-based pagination for consistent product list results."""

from base64 import b64decode, b64encode
from json import dumps, loads
from typing import Any
from uuid import UUID

from django.db import models
from rest_framework.pagination import BasePagination
from rest_framework.request import Request
from rest_framework.response import Response


class ProductCursorPagination(BasePagination):
    """
    Cursor pagination using encoded sort values and product ID.

    Avoids OFFSET performance issues on large catalogs.
    """

    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100
    cursor_query_param = 'cursor'
    ordering_param = 'sort'

    def paginate_queryset(self, queryset, request: Request, view=None):
        self.request = request
        self.page_size = self.get_page_size(request)
        self.ordering = self._resolve_ordering(request)

        cursor = request.query_params.get(self.cursor_query_param)
        if cursor:
            queryset = self._apply_cursor(queryset, cursor)

        self.results = list(queryset[: self.page_size + 1])
        self.has_next = len(self.results) > self.page_size
        if self.has_next:
            self.results = self.results[: self.page_size]

        return self.results

    def get_paginated_response(self, data: list[Any]) -> Response:
        next_cursor = None
        if self.has_next and self.results:
            last_item = self.results[-1]
            next_cursor = self._encode_cursor(last_item)

        return Response(
            {
                'next': next_cursor,
                'page_size': self.page_size,
                'results': data,
            }
        )

    def get_page_size(self, request: Request) -> int:
        if self.page_size_query_param:
            try:
                size = int(request.query_params[self.page_size_query_param])
            except (KeyError, ValueError):
                return self.page_size
            return min(max(size, 1), self.max_page_size)
        return self.page_size

    def _resolve_ordering(self, request: Request) -> str:
        sort = request.query_params.get(self.ordering_param, 'relevance')
        allowed = {
            'price',
            '-price',
            'relevance',
            '-relevance',
            'trust_score',
            '-trust_score',
            'delivery_speed',
            '-delivery_speed',
        }
        return sort if sort in allowed else 'relevance'

    def _encode_cursor(self, item) -> str:
        payload = {
            'id': str(item.id),
            'ordering': self.ordering,
        }
        if self.ordering in ('price', '-price'):
            payload['price'] = str(item.price)
        elif self.ordering in ('relevance', '-relevance'):
            payload['rank'] = getattr(item, 'rank', 0)
        elif self.ordering in ('trust_score', '-trust_score'):
            payload['trust_score'] = item.supplier.trust_score
        elif self.ordering in ('delivery_speed', '-delivery_speed'):
            payload['delivery_days'] = str(item.supplier.average_delivery_days)

        encoded = b64encode(dumps(payload).encode()).decode()
        return encoded

    def _apply_cursor(self, queryset, cursor: str):
        try:
            payload = loads(b64decode(cursor.encode()).decode())
            product_id = UUID(payload['id'])
        except (ValueError, KeyError, TypeError):
            return queryset

        ordering = payload.get('ordering', self.ordering)
        if ordering == 'price':
            return queryset.filter(
                models.Q(price__gt=payload['price'])
                | models.Q(price=payload['price'], id__gt=product_id)
            )
        if ordering == '-price':
            return queryset.filter(
                models.Q(price__lt=payload['price'])
                | models.Q(price=payload['price'], id__gt=product_id)
            )
        if ordering in ('relevance', '-relevance'):
            rank = payload.get('rank', 0)
            if ordering == 'relevance':
                return queryset.filter(
                    models.Q(rank__lt=rank)
                    | models.Q(rank=rank, id__gt=product_id)
                )
            return queryset.filter(
                models.Q(rank__gt=rank)
                | models.Q(rank=rank, id__gt=product_id)
            )
        if ordering in ('trust_score', '-trust_score'):
            trust_score = payload.get('trust_score', 0)
            if ordering == 'trust_score':
                return queryset.filter(
                    models.Q(supplier__trust_score__gt=trust_score)
                    | models.Q(
                        supplier__trust_score=trust_score,
                        id__gt=product_id,
                    )
                )
            return queryset.filter(
                models.Q(supplier__trust_score__lt=trust_score)
                | models.Q(
                    supplier__trust_score=trust_score,
                    id__gt=product_id,
                )
            )
        if ordering in ('delivery_speed', '-delivery_speed'):
            delivery_days = payload.get('delivery_days', '0')
            if ordering == 'delivery_speed':
                return queryset.filter(
                    models.Q(supplier__average_delivery_days__gt=delivery_days)
                    | models.Q(
                        supplier__average_delivery_days=delivery_days,
                        id__gt=product_id,
                    )
                )
            return queryset.filter(
                models.Q(supplier__average_delivery_days__lt=delivery_days)
                | models.Q(
                    supplier__average_delivery_days=delivery_days,
                    id__gt=product_id,
                )
            )
        return queryset.filter(id__gt=product_id)
