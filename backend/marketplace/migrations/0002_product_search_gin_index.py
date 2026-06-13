"""Add PostgreSQL GIN full-text search index on products (skipped on SQLite)."""

from django.db import connection, migrations


def create_search_index(apps, schema_editor):
    if connection.vendor != 'postgresql':
        return

    schema_editor.execute(
        """
        CREATE INDEX IF NOT EXISTS products_search_idx
        ON marketplace_product
        USING gin(
            to_tsvector(
                'english',
                name || ' ' || COALESCE(generic_name, '') || ' ' || COALESCE(description, '')
            )
        );
        """
    )


def drop_search_index(apps, schema_editor):
    if connection.vendor != 'postgresql':
        return

    schema_editor.execute('DROP INDEX IF EXISTS products_search_idx;')


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('marketplace', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_search_index, drop_search_index),
    ]
