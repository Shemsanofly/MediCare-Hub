"""Marketplace business logic for search, filtering, and verification."""

import re
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from django.db import connection
from django.db.models import F, FloatField, Prefetch, Q, QuerySet, Value
from django.utils import timezone

from marketplace.models import Category, Product, ProductBatch, Supplier, SupplierDocument

BRELA_NUMBER_PATTERN = re.compile(r'^\d{8}-\d{5}$')
TMDA_LICENSE_PATTERN = re.compile(r'^TMDA/[A-Z]{3}/\d{4}/\d{4,6}$')

REQUIRED_DOCUMENT_TYPES = {
    SupplierDocument.DocumentType.BUSINESS_CERT,
    SupplierDocument.DocumentType.TMDA_LICENSE,
    SupplierDocument.DocumentType.TAX_CLEARANCE,
}


def validate_brela_number(value: str) -> str:
    """Validate Tanzanian BRELA registration number format."""
    normalized = value.strip()
    if not BRELA_NUMBER_PATTERN.match(normalized):
        raise ValueError(
            'BRELA registration number must match format: xxxxxxxx-xxxxx'
        )
    return normalized


def validate_tmda_license_number(value: str) -> str:
    """Validate TMDA license number format."""
    normalized = value.strip().upper()
    if not TMDA_LICENSE_PATTERN.match(normalized):
        raise ValueError(
            'TMDA license number must match format: TMDA/XXX/YYYY/NNNN'
        )
    return normalized


def get_category_descendant_ids(category_id: UUID) -> list[UUID]:
    """Return category ID and all descendant subcategory IDs."""
    if connection.vendor == 'postgresql':
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH RECURSIVE category_tree AS (
                    SELECT id FROM marketplace_category WHERE id = %s
                    UNION ALL
                    SELECT c.id
                    FROM marketplace_category c
                    INNER JOIN category_tree ct ON c.parent_id = ct.id
                )
                SELECT id FROM category_tree
                """,
                [str(category_id)],
            )
            return [UUID(str(row[0])) for row in cursor.fetchall()]

    descendant_ids = [category_id]
    frontier = [category_id]
    while frontier:
        children = list(
            Category.objects.filter(parent_id__in=frontier).values_list('id', flat=True)
        )
        if not children:
            break
        descendant_ids.extend(children)
        frontier = children
    return descendant_ids


def build_product_search_queryset(params: dict[str, Any]) -> QuerySet[Product]:
    """
    Build an optimized product queryset with filters, full-text search, and sorting.

    Uses select_related/prefetch_related to avoid N+1 queries.
    """
    today = timezone.now().date()
    valid_batches = ProductBatch.objects.filter(
        expiry_date__gt=today,
        quantity__gt=F('reserved_quantity'),
    )

    queryset = (
        Product.objects.filter(is_active=True)
        .select_related('supplier', 'supplier__organisation', 'category')
        .prefetch_related(
            Prefetch('batches', queryset=valid_batches.order_by('expiry_date')),
        )
    )

    search_term = params.get('search', '').strip()
    if search_term:
        if connection.vendor == 'postgresql':
            from django.contrib.postgres.search import (
                SearchQuery,
                SearchRank,
                SearchVector,
            )

            search_vector = (
                SearchVector('name', weight='A', config='english')
                + SearchVector('generic_name', weight='B', config='english')
                + SearchVector('description', weight='C', config='english')
            )
            search_query = SearchQuery(
                search_term,
                search_type='websearch',
                config='english',
            )
            queryset = queryset.annotate(
                search=search_vector,
                rank=SearchRank(search_vector, search_query),
            ).filter(search=search_query)
        else:
            queryset = queryset.filter(
                Q(name__icontains=search_term)
                | Q(generic_name__icontains=search_term)
                | Q(description__icontains=search_term)
            ).annotate(rank=Value(1.0, output_field=FloatField()))
    else:
        queryset = queryset.annotate(rank=Value(0.0, output_field=FloatField()))

    category_id = params.get('category')
    if category_id:
        try:
            category_ids = get_category_descendant_ids(UUID(str(category_id)))
            queryset = queryset.filter(category_id__in=category_ids)
        except (ValueError, Category.DoesNotExist):
            queryset = queryset.none()

    supplier_id = params.get('supplier')
    if supplier_id:
        queryset = queryset.filter(supplier_id=supplier_id)

    min_price = params.get('min_price')
    if min_price is not None:
        try:
            queryset = queryset.filter(price__gte=Decimal(str(min_price)))
        except (InvalidOperation, TypeError):
            pass

    max_price = params.get('max_price')
    if max_price is not None:
        try:
            queryset = queryset.filter(price__lte=Decimal(str(max_price)))
        except (InvalidOperation, TypeError):
            pass

    cold_chain = params.get('cold_chain_required')
    if cold_chain is not None:
        queryset = queryset.filter(
            is_cold_chain_required=str(cold_chain).lower() in ('true', '1', 'yes'),
        )

    in_stock = params.get('in_stock')
    if in_stock is not None and str(in_stock).lower() in ('true', '1', 'yes'):
        queryset = queryset.filter(
            batches__expiry_date__gt=today,
            batches__quantity__gt=F('batches__reserved_quantity'),
        ).distinct()

    valid_expiry = params.get('valid_expiry')
    if valid_expiry is None or str(valid_expiry).lower() in ('true', '1', 'yes'):
        queryset = queryset.filter(
            batches__expiry_date__gt=today,
        ).distinct()

    sort = params.get('sort', 'relevance')
    sort_map = {
        'price': ['price', 'id'],
        '-price': ['-price', 'id'],
        'relevance': ['-rank', 'name', 'id'],
        '-relevance': ['rank', 'name', 'id'],
        'trust_score': ['supplier__trust_score', 'id'],
        '-trust_score': ['-supplier__trust_score', 'id'],
        'delivery_speed': ['supplier__average_delivery_days', 'id'],
        '-delivery_speed': ['-supplier__average_delivery_days', 'id'],
    }
    queryset = queryset.order_by(*sort_map.get(sort, ['-rank', 'name', 'id']))
    return queryset


def supplier_has_required_documents(supplier: Supplier) -> bool:
    """Return whether all required verification documents are uploaded."""
    uploaded = set(supplier.documents.values_list('document_type', flat=True))
    return REQUIRED_DOCUMENT_TYPES.issubset(uploaded)


def get_pending_suppliers_queryset() -> QuerySet[Supplier]:
    """Return suppliers awaiting admin verification with prefetched documents."""
    return (
        Supplier.objects.filter(verification_status=Supplier.VerificationStatus.PENDING)
        .select_related('organisation', 'verified_by')
        .prefetch_related('documents')
        .order_by('created_at')
    )
