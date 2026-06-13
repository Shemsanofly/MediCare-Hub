"""Batch reservation model for checkout inventory holds."""

import uuid

from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('marketplace', '0003_productbatch_inventory_fields'),
        ('orders', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='BatchReservation',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('quantity', models.PositiveIntegerField()),
                ('is_released', models.BooleanField(default=False)),
                ('is_fulfilled', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('batch', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='reservations', to='marketplace.productbatch')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='batch_reservations', to='orders.order')),
                ('order_item', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='batch_reservations', to='orders.orderitem')),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='batchreservation',
            index=models.Index(fields=['order', 'is_released', 'is_fulfilled'], name='orders_batc_order_i_0f0f62_idx'),
        ),
    ]
