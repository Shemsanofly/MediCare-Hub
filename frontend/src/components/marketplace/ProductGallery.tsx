import { useState } from 'react';

import { getMediaUrl } from '@/api';
import type { ProductImage } from '@/types';

interface ProductGalleryProps {
  images: ProductImage[];
  /** Fallback single image when the product has no images[] entries. */
  fallbackUrl: string | null;
  name: string;
}

/** Image gallery with a main view and selectable thumbnails. */
export function ProductGallery({ images, fallbackUrl, name }: ProductGalleryProps) {
  const urls =
    images.length > 0
      ? images.map((img) => getMediaUrl(img.url) ?? img.url)
      : fallbackUrl
        ? [getMediaUrl(fallbackUrl) ?? fallbackUrl]
        : [];

  const [selected, setSelected] = useState(0);

  if (urls.length === 0) return null;

  const active = urls[Math.min(selected, urls.length - 1)];

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <img src={active} alt={name} className="h-64 w-full object-contain sm:h-80" />
      </div>

      {urls.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {urls.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setSelected(index)}
              className={`h-16 w-16 overflow-hidden rounded-lg border-2 bg-white transition ${
                index === selected
                  ? 'border-primary'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              aria-label={`View image ${index + 1}`}
            >
              <img src={url} alt={`${name} ${index + 1}`} className="h-full w-full object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductGallery;
