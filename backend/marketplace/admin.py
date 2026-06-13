from django.contrib import admin

from marketplace.models import Category, Product, ProductBatch, Supplier, SupplierDocument


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent', 'is_regulated', 'tmda_required')
    search_fields = ('name',)
    list_filter = ('is_regulated', 'tmda_required')


class SupplierDocumentInline(admin.TabularInline):
    model = SupplierDocument
    extra = 0


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        'organisation',
        'verification_status',
        'trust_score',
        'tmda_license_number',
        'license_expiry_date',
    )
    list_filter = ('verification_status', 'is_cold_chain_certified')
    search_fields = ('organisation__name', 'brela_registration_number', 'tmda_license_number')
    inlines = [SupplierDocumentInline]


class ProductBatchInline(admin.TabularInline):
    model = ProductBatch
    extra = 0


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'supplier', 'category', 'price', 'currency', 'is_active')
    list_filter = ('is_active', 'is_cold_chain_required', 'category')
    search_fields = ('name', 'generic_name', 'gtin')
    inlines = [ProductBatchInline]


@admin.register(ProductBatch)
class ProductBatchAdmin(admin.ModelAdmin):
    list_display = (
        'batch_number',
        'product',
        'expiry_date',
        'quantity',
        'reserved_quantity',
        'unit_cost',
    )
    list_filter = ('expiry_date',)
    search_fields = ('batch_number', 'product__name')
