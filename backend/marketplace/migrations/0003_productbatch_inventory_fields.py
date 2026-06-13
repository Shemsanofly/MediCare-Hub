"""Inventory fields for ProductBatch."""

from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion


def populate_supplier_from_product(apps, schema_editor):
    ProductBatch = apps.get_model('marketplace', 'ProductBatch')
    for batch in ProductBatch.objects.select_related('product').iterator():
        if batch.supplier_id is None and batch.product_id:
            batch.supplier_id = batch.product.supplier_id
            batch.save(update_fields=['supplier_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('marketplace', '0002_product_search_gin_index'),
    ]

    operations = [
        migrations.RenameField(
            model_name='productbatch',
            old_name='quantity_available',
            new_name='quantity',
        ),
        migrations.AddField(
            model_name='productbatch',
            name='reserved_quantity',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='productbatch',
            name='unit_cost',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('0.00'),
                max_digits=10,
            ),
        ),
        migrations.AddField(
            model_name='productbatch',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AddField(
            model_name='productbatch',
            name='supplier',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='batches',
                to='marketplace.supplier',
            ),
        ),
        migrations.RunPython(populate_supplier_from_product, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='productbatch',
            name='supplier',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='batches',
                to='marketplace.supplier',
            ),
        ),
        migrations.AddIndex(
            model_name='productbatch',
            index=models.Index(fields=['supplier'], name='marketplace_supplie_6d2f0a_idx'),
        ),
        migrations.AddConstraint(
            model_name='productbatch',
            constraint=models.CheckConstraint(
                check=models.Q(('reserved_quantity__lte', models.F('quantity'))),
                name='batch_reserved_lte_quantity',
            ),
        ),
    ]
