"""Marketplace serializers."""

from rest_framework import serializers

from marketplace.models import (
    Category,
    Product,
    ProductBatch,
    Supplier,
    SupplierDocument,
)
from marketplace.services import (
    supplier_has_required_documents,
    validate_brela_number,
    validate_tmda_license_number,
)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ('id', 'name', 'parent', 'is_regulated', 'tmda_required')


class ProductBatchPublicSerializer(serializers.ModelSerializer):
    """Hospital-safe batch summary without supplier cost."""

    manufacturing_date = serializers.DateField(source='manufacture_date', read_only=True)
    available_quantity = serializers.IntegerField(read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = ProductBatch
        fields = (
            'id',
            'batch_number',
            'manufacturing_date',
            'expiry_date',
            'available_quantity',
            'status',
            'storage_conditions',
            'tmda_batch_cert_number',
            'created_at',
        )


class ProductBatchSupplierSerializer(serializers.ModelSerializer):
    """Full batch details for suppliers and admins."""

    manufacturing_date = serializers.DateField(source='manufacture_date', read_only=True)
    available_quantity = serializers.IntegerField(read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = ProductBatch
        fields = (
            'id',
            'batch_number',
            'manufacturing_date',
            'manufacture_date',
            'expiry_date',
            'quantity',
            'reserved_quantity',
            'available_quantity',
            'unit_cost',
            'status',
            'storage_conditions',
            'tmda_batch_cert_number',
            'supplier',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'supplier',
            'available_quantity',
            'status',
            'created_at',
            'updated_at',
        )


class ProductBatchWriteSerializer(serializers.ModelSerializer):
    manufacturing_date = serializers.DateField(source='manufacture_date')

    class Meta:
        model = ProductBatch
        fields = (
            'batch_number',
            'manufacturing_date',
            'expiry_date',
            'quantity',
            'unit_cost',
            'storage_conditions',
            'tmda_batch_cert_number',
        )

    def validate(self, attrs):
        manufacture_date = attrs.get('manufacture_date')
        expiry_date = attrs.get('expiry_date')
        if manufacture_date and expiry_date and expiry_date <= manufacture_date:
            raise serializers.ValidationError(
                {'expiry_date': 'Expiry date must be after manufacturing date.'},
            )
        if attrs.get('quantity', 1) < 0:
            raise serializers.ValidationError(
                {'quantity': 'Quantity cannot be negative.'},
            )
        return attrs


# Backward-compatible alias used in older imports.
ProductBatchSerializer = ProductBatchPublicSerializer


class SupplierSummarySerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source='organisation.name', read_only=True)
    supplier_rating = serializers.IntegerField(source='trust_score', read_only=True)
    average_delivery_days = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = Supplier
        fields = (
            'id',
            'organisation_name',
            'supplier_rating',
            'trust_score',
            'average_delivery_days',
            'verification_status',
        )


class ProductWriteSerializer(serializers.ModelSerializer):
    """Writable product fields for supplier and admin create/update."""

    supplier_id = serializers.UUIDField(required=False, write_only=True)
    category_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = Product
        fields = (
            'name',
            'generic_name',
            'gtin',
            'description',
            'category_id',
            'unit_of_measure',
            'price',
            'currency',
            'minimum_order_quantity',
            'is_cold_chain_required',
            'temperature_range_min',
            'temperature_range_max',
            'tmda_registration_number',
            'is_active',
            'supplier_id',
        )
        extra_kwargs = {
            'generic_name': {'required': False, 'allow_blank': True},
            'gtin': {'required': False, 'allow_blank': True},
            'description': {'required': False, 'allow_blank': True},
            'currency': {'required': False},
            'minimum_order_quantity': {'required': False},
            'is_cold_chain_required': {'required': False},
            'temperature_range_min': {'required': False, 'allow_null': True},
            'temperature_range_max': {'required': False, 'allow_null': True},
            'tmda_registration_number': {'required': False, 'allow_blank': True},
            'is_active': {'required': False},
        }

    def validate_category_id(self, value):
        if not Category.objects.filter(pk=value).exists():
            raise serializers.ValidationError('Category not found.')
        return value

    def validate(self, attrs: dict) -> dict:
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        supplier_id = attrs.get('supplier_id')

        if self.instance is None and not attrs.get('category_id'):
            raise serializers.ValidationError(
                {'category_id': 'This field is required.'},
            )

        if user is not None and user.role == 'ADMIN':
            if self.instance is None and supplier_id is None:
                raise serializers.ValidationError(
                    {'supplier_id': 'This field is required for admin users.'},
                )
        elif supplier_id is not None:
            raise serializers.ValidationError(
                {'supplier_id': 'Only administrators may specify supplier_id.'},
            )

        return attrs

    def create(self, validated_data: dict) -> Product:
        from authentication.models import CustomUser

        request = self.context['request']
        user = request.user
        category_id = validated_data.pop('category_id')
        supplier_id = validated_data.pop('supplier_id', None)
        category = Category.objects.get(pk=category_id)

        if user.role == CustomUser.Role.ADMIN:
            supplier = Supplier.objects.get(pk=supplier_id)
        else:
            supplier = Supplier.objects.get(organisation_id=user.organisation_id)

        return Product.objects.create(
            supplier=supplier,
            category=category,
            **validated_data,
        )

    def update(self, instance: Product, validated_data: dict) -> Product:
        category_id = validated_data.pop('category_id', None)
        validated_data.pop('supplier_id', None)

        if category_id is not None:
            instance.category = Category.objects.get(pk=category_id)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance


class ProductListSerializer(serializers.ModelSerializer):
    supplier = SupplierSummarySerializer(read_only=True)
    category = CategorySerializer(read_only=True)
    batches = serializers.SerializerMethodField()
    total_quantity_available = serializers.SerializerMethodField()
    inventory_status = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id',
            'name',
            'generic_name',
            'gtin',
            'description',
            'unit_of_measure',
            'price',
            'currency',
            'minimum_order_quantity',
            'is_cold_chain_required',
            'temperature_range_min',
            'temperature_range_max',
            'tmda_registration_number',
            'is_active',
            'category',
            'supplier',
            'batches',
            'total_quantity_available',
            'inventory_status',
            'created_at',
            'updated_at',
        )

    def _can_view_supplier_batch_fields(self) -> bool:
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated:
            return False
        from authentication.models import CustomUser

        return request.user.role in (
            CustomUser.Role.SUPPLIER,
            CustomUser.Role.ADMIN,
        )

    def get_batches(self, obj: Product) -> list[dict]:
        serializer_class = (
            ProductBatchSupplierSerializer
            if self._can_view_supplier_batch_fields()
            else ProductBatchPublicSerializer
        )
        return serializer_class(obj.batches.all(), many=True).data

    def get_total_quantity_available(self, obj: Product) -> int:
        return obj.total_quantity_available

    def get_inventory_status(self, obj: Product) -> str:
        total = obj.total_quantity_available
        if total <= 0:
            return ProductBatch.Status.OUT_OF_STOCK
        if total < 50:
            return ProductBatch.Status.LOW_STOCK
        return ProductBatch.Status.ACTIVE


class SupplierDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierDocument
        fields = ('id', 'document_type', 'file', 'uploaded_at')


class SupplierVerificationSerializer(serializers.Serializer):
    """Validates supplier verification submission data and documents."""

    brela_registration_number = serializers.CharField(max_length=20)
    tmda_license_number = serializers.CharField(max_length=100)
    license_expiry_date = serializers.DateField()
    business_cert = serializers.FileField(required=False)
    tmda_license = serializers.FileField(required=False)
    tax_clearance = serializers.FileField(required=False)

    def validate_brela_registration_number(self, value: str) -> str:
        try:
            return validate_brela_number(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_tmda_license_number(self, value: str) -> str:
        try:
            return validate_tmda_license_number(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate(self, attrs: dict) -> dict:
        supplier = self.context.get('supplier')
        if supplier is None:
            raise serializers.ValidationError('Supplier context is required.')

        missing_documents = []
        for field_name, document_type in (
            ('business_cert', SupplierDocument.DocumentType.BUSINESS_CERT),
            ('tmda_license', SupplierDocument.DocumentType.TMDA_LICENSE),
            ('tax_clearance', SupplierDocument.DocumentType.TAX_CLEARANCE),
        ):
            if attrs.get(field_name) is None and not supplier.documents.filter(
                document_type=document_type,
            ).exists():
                missing_documents.append(field_name)

        if missing_documents:
            raise serializers.ValidationError(
                {
                    field: 'This document is required for verification.'
                    for field in missing_documents
                }
            )
        return attrs

    def save(self, **kwargs) -> Supplier:
        supplier: Supplier = self.context['supplier']
        supplier.brela_registration_number = self.validated_data[
            'brela_registration_number'
        ]
        supplier.tmda_license_number = self.validated_data['tmda_license_number']
        supplier.license_expiry_date = self.validated_data['license_expiry_date']
        supplier.verification_status = Supplier.VerificationStatus.PENDING
        supplier.save(
            update_fields=[
                'brela_registration_number',
                'tmda_license_number',
                'license_expiry_date',
                'verification_status',
                'updated_at',
            ]
        )

        document_map = {
            'business_cert': SupplierDocument.DocumentType.BUSINESS_CERT,
            'tmda_license': SupplierDocument.DocumentType.TMDA_LICENSE,
            'tax_clearance': SupplierDocument.DocumentType.TAX_CLEARANCE,
        }
        for field_name, document_type in document_map.items():
            uploaded_file = self.validated_data.get(field_name)
            if uploaded_file is None:
                continue
            SupplierDocument.objects.update_or_create(
                supplier=supplier,
                document_type=document_type,
                defaults={'file': uploaded_file},
            )
        return supplier


class SupplierPendingSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source='organisation.name', read_only=True)
    documents = SupplierDocumentSerializer(many=True, read_only=True)
    has_required_documents = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = (
            'id',
            'organisation_name',
            'brela_registration_number',
            'tmda_license_number',
            'license_expiry_date',
            'is_cold_chain_certified',
            'cold_chain_cert_expiry',
            'verification_status',
            'rejection_reason',
            'documents',
            'has_required_documents',
            'created_at',
        )

    def get_has_required_documents(self, obj: Supplier) -> bool:
        return supplier_has_required_documents(obj)


class SupplierRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=10, max_length=2000)


class SupplierSuspendSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=10, max_length=2000)
