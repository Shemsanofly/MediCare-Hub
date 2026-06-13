"""Rebuild the PostgreSQL GIN full-text search index on marketplace products."""

from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = (
        'Rebuild the GIN index used for product full-text search. '
        'Uses CREATE INDEX CONCURRENTLY for zero-downtime rebuilds.'
    )

    INDEX_NAME = 'products_search_idx'
    DROP_SQL = f'DROP INDEX IF EXISTS {INDEX_NAME};'
    CREATE_SQL = f"""
        CREATE INDEX CONCURRENTLY {INDEX_NAME}
        ON marketplace_product
        USING gin(
            to_tsvector(
                'english',
                name || ' ' || COALESCE(generic_name, '') || ' ' || COALESCE(description, '')
            )
        );
    """

    def handle(self, *args, **options):
        if connection.vendor != 'postgresql':
            self.stdout.write(
                self.style.WARNING(
                    'Product search index rebuild is only supported on PostgreSQL. '
                    'SQLite uses ORM-based search filters.'
                )
            )
            return

        self.stdout.write('Dropping existing product search index...')
        with connection.cursor() as cursor:
            cursor.execute(self.DROP_SQL)

        self.stdout.write('Creating product search index concurrently...')
        previous_autocommit = connection.get_autocommit()
        connection.set_autocommit(True)
        try:
            with connection.cursor() as cursor:
                cursor.execute(self.CREATE_SQL)
        finally:
            connection.set_autocommit(previous_autocommit)

        self.stdout.write(
            self.style.SUCCESS(f'Successfully rebuilt index {self.INDEX_NAME}.')
        )
