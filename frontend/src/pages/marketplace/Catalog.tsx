import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { useQueryClient } from '@tanstack/react-query';

import { marketplaceApi, ordersApi } from '@/api';
import FilterSidebar, { type CatalogFilters } from '@/components/marketplace/FilterSidebar';
import ProductCard from '@/components/marketplace/ProductCard';
import { ProductCardSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { useDebounce } from '@/hooks/useDebounce';
import type { Category, Product, SupplierSummary } from '@/types';

const DEFAULT_PRICE_RANGE = { min: 0, max: 10_000_000 };

const buildCategoryTree = (flat: Category[]): Category[] => {
  const map = new Map<string, Category>();
  flat.forEach((cat) => map.set(cat.id, { ...cat, children: [] }));

  const roots: Category[] = [];
  map.forEach((cat) => {
    if (cat.parent && map.has(cat.parent)) {
      map.get(cat.parent)!.children!.push(cat);
    } else {
      roots.push(cat);
    }
  });
  return roots;
};

const parseFiltersFromParams = (params: URLSearchParams): CatalogFilters => ({
  category: params.get('category'),
  minPrice: Number(params.get('min_price') ?? DEFAULT_PRICE_RANGE.min),
  maxPrice: Number(params.get('max_price') ?? DEFAULT_PRICE_RANGE.max),
  suppliers: params.getAll('supplier'),
  coldChain: params.get('cold_chain') === 'true',
  inStockOnly: params.get('in_stock') === 'true',
});

const filtersToParams = (search: string, filters: CatalogFilters): URLSearchParams => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (filters.category) params.set('category', filters.category);
  if (filters.minPrice > DEFAULT_PRICE_RANGE.min) {
    params.set('min_price', String(filters.minPrice));
  }
  if (filters.maxPrice < DEFAULT_PRICE_RANGE.max) {
    params.set('max_price', String(filters.maxPrice));
  }
  filters.suppliers.forEach((id) => params.append('supplier', id));
  if (filters.coldChain) params.set('cold_chain', 'true');
  if (filters.inStockOnly) params.set('in_stock', 'true');
  return params;
};

/** Product catalog with debounced search and URL-synced filters. */
const Catalog = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebounce(searchInput, 300);

  const [filters, setFilters] = useState<CatalogFilters>(() =>
    parseFiltersFromParams(searchParams),
  );

  useEffect(() => {
    const next = filtersToParams(debouncedSearch, filters);
    setSearchParams(next, { replace: true });
  }, [debouncedSearch, filters, setSearchParams]);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await marketplaceApi.getCategories();
      return buildCategoryTree(data.results ?? []);
    },
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data } = await marketplaceApi.getSuppliers();
      return data.results ?? [];
    },
  });

  const apiFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      category: filters.category ?? undefined,
      supplier: filters.suppliers.length === 1 ? filters.suppliers[0] : undefined,
      min_price: filters.minPrice > DEFAULT_PRICE_RANGE.min ? filters.minPrice : undefined,
      max_price: filters.maxPrice < DEFAULT_PRICE_RANGE.max ? filters.maxPrice : undefined,
      cold_chain_required: filters.coldChain || undefined,
      in_stock: filters.inStockOnly || undefined,
      page_size: 24,
    }),
    [debouncedSearch, filters],
  );

  const productsQuery = useQuery({
    queryKey: ['products', apiFilters],
    queryFn: async () => {
      const { data } = await marketplaceApi.getProducts(apiFilters);
      return data.results ?? [];
    },
  });

  const handleAddToCart = useCallback(
    async (product: Product, quantity: number) => {
      try {
        await ordersApi.addToCart(product.id, quantity);
        void queryClient.invalidateQueries({ queryKey: ['cart'] });
        toast.success(`${product.name} added to cart.`);
      } catch {
        // Error toast handled by axios interceptor.
      }
    },
    [queryClient],
  );

  const handleRequestQuote = useCallback((product: Product) => {
    toast.info(`Quote request initiated for ${product.name}.`);
  }, []);

  const suppliers: SupplierSummary[] = suppliersQuery.data ?? [];
  const products = productsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Product Catalog</h1>
        <p className="mt-1 text-gray-600">
          Search and filter medical supplies from verified suppliers.
        </p>
      </div>

      <div className="relative">
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search products by name, generic name, or GTIN…"
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-4 pr-4 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {categoriesQuery.isLoading ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : (
          <FilterSidebar
            categories={categoriesQuery.data ?? []}
            suppliers={suppliers}
            filters={filters}
            onChange={setFilters}
            priceRange={DEFAULT_PRICE_RANGE}
          />
        )}

        <div>
          {productsQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-xl border border-gray-100 bg-white p-12 text-center shadow-sm">
              <p className="text-gray-500">No products match your filters.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                  onRequestQuote={handleRequestQuote}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Catalog;
