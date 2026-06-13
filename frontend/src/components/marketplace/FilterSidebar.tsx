import CategoryTree from '@/components/marketplace/CategoryTree';
import type { Category, SupplierSummary } from '@/types';

export interface CatalogFilters {
  category: string | null;
  minPrice: number;
  maxPrice: number;
  suppliers: string[];
  coldChain: boolean;
  inStockOnly: boolean;
}

interface FilterSidebarProps {
  categories: Category[];
  suppliers: SupplierSummary[];
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  priceRange: { min: number; max: number };
}

/** Catalog filter sidebar with category tree, price slider, and toggles. */
const FilterSidebar = ({
  categories,
  suppliers,
  filters,
  onChange,
  priceRange,
}: FilterSidebarProps) => {
  const toggleSupplier = (supplierId: string) => {
    const next = filters.suppliers.includes(supplierId)
      ? filters.suppliers.filter((id) => id !== supplierId)
      : [...filters.suppliers, supplierId];
    onChange({ ...filters, suppliers: next });
  };

  return (
    <aside className="space-y-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Categories</h3>
        <CategoryTree
          categories={categories}
          selectedId={filters.category}
          onSelect={(categoryId) => onChange({ ...filters, category: categoryId })}
        />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Price range (TZS)</h3>
        <div className="space-y-3">
          <input
            type="range"
            min={priceRange.min}
            max={priceRange.max}
            value={filters.minPrice}
            onChange={(event) =>
              onChange({ ...filters, minPrice: Number(event.target.value) })
            }
            className="w-full accent-primary"
          />
          <input
            type="range"
            min={priceRange.min}
            max={priceRange.max}
            value={filters.maxPrice}
            onChange={(event) =>
              onChange({ ...filters, maxPrice: Number(event.target.value) })
            }
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{filters.minPrice.toLocaleString()} TZS</span>
            <span>{filters.maxPrice.toLocaleString()} TZS</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Suppliers</h3>
        <div className="max-h-40 space-y-2 overflow-y-auto">
          {suppliers.map((supplier) => (
            <label key={supplier.id} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={filters.suppliers.includes(supplier.id)}
                onChange={() => toggleSupplier(supplier.id)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              {supplier.organisation_name}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={filters.coldChain}
            onChange={(event) => onChange({ ...filters, coldChain: event.target.checked })}
            className="rounded border-gray-300 text-primary focus:ring-primary"
          />
          Cold chain required
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={(event) => onChange({ ...filters, inStockOnly: event.target.checked })}
            className="rounded border-gray-300 text-primary focus:ring-primary"
          />
          In stock only
        </label>
      </div>
    </aside>
  );
};

export default FilterSidebar;
