import { Link } from 'react-router-dom';

import type { Product } from '@/types';

const LARGE_ORDER_THRESHOLD = 100;

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product, quantity: number) => void;
  onRequestQuote: (product: Product) => void;
}

const formatPrice = (price: string, currency: string) =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: currency || 'TZS',
    maximumFractionDigits: 0,
  }).format(Number(price));

/** Product card for marketplace catalog grid. */
const ProductCard = ({ product, onAddToCart, onRequestQuote }: ProductCardProps) => {
  const inStock = product.total_quantity_available > 0;
  const isLargeOrder = product.minimum_order_quantity >= LARGE_ORDER_THRESHOLD;
  const isTmdaVerified = Boolean(product.tmda_registration_number);

  return (
    <article className="flex flex-col rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <Link
          to={`/marketplace/products/${product.id}`}
          className="font-semibold text-gray-900 hover:text-primary"
        >
          {product.name}
        </Link>
        {isTmdaVerified && (
          <span className="shrink-0 rounded-full bg-secondary-50 px-2 py-0.5 text-xs font-medium text-secondary">
            TMDA ✓
          </span>
        )}
      </div>

      {product.generic_name && (
        <p className="mb-1 text-sm text-gray-500">{product.generic_name}</p>
      )}

      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-gray-600">{product.supplier.organisation_name}</span>
        <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary">
          ★ {product.supplier.trust_score}
        </span>
      </div>

      <p className="mb-2 text-lg font-bold text-gray-900">
        {formatPrice(product.price, product.currency)}
        <span className="ml-1 text-sm font-normal text-gray-500">
          / {product.unit_of_measure}
        </span>
      </p>

      <p className={`mb-4 text-sm ${inStock ? 'text-secondary' : 'text-red-600'}`}>
        {inStock
          ? `${product.total_quantity_available} in stock`
          : 'Out of stock'}
      </p>

      <div className="mt-auto">
        {isLargeOrder ? (
          <button
            type="button"
            onClick={() => onRequestQuote(product)}
            className="w-full rounded-lg border border-primary py-2 text-sm font-semibold text-primary hover:bg-primary-50"
          >
            Request Quote
          </button>
        ) : (
          <button
            type="button"
            disabled={!inStock}
            onClick={() => onAddToCart(product, product.minimum_order_quantity || 1)}
            className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to Cart
          </button>
        )}
      </div>
    </article>
  );
};

export default ProductCard;
