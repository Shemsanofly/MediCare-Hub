import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { getMediaUrl, marketplaceApi } from '@/api';
import type { ProductImage } from '@/types';

const MAX_IMAGES = 8;

interface ProductImageManagerProps {
  /** Existing product id when editing; null while creating a new product. */
  productId: string | null;
  /** Images already saved on the product (edit mode). */
  images: ProductImage[];
  /** Files selected but not yet uploaded (create mode). */
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
  /** Called after a live change (upload/delete/set-primary) so the parent can refetch. */
  onChanged?: () => void;
  disabled?: boolean;
}

/**
 * Lets a supplier attach several pictures to a product. While creating a new
 * product the files are held locally and handed to the parent to upload after
 * the product is saved; while editing an existing product, changes are applied
 * immediately (upload, set primary, remove).
 */
export function ProductImageManager({
  productId,
  images,
  pendingFiles,
  onPendingFilesChange,
  onChanged,
  disabled,
}: ProductImageManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // Object URLs for local previews of not-yet-uploaded files.
  const pendingPreviews = useMemo(
    () => pendingFiles.map((file) => URL.createObjectURL(file)),
    [pendingFiles],
  );
  useEffect(() => {
    return () => pendingPreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [pendingPreviews]);

  const totalCount = images.length + pendingFiles.length;
  const isDisabled = disabled || busy;

  const handleSelectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (picked.length === 0) return;

    const room = MAX_IMAGES - totalCount;
    if (room <= 0) {
      toast.error(`A product can have at most ${MAX_IMAGES} images.`);
      return;
    }
    const files = picked.slice(0, room);

    if (productId) {
      // Edit mode: upload straight away.
      setBusy(true);
      try {
        await marketplaceApi.uploadImages(productId, files);
        toast.success(files.length > 1 ? `${files.length} images added.` : 'Image added.');
        onChanged?.();
      } catch {
        // Error toast handled by the axios interceptor.
      } finally {
        setBusy(false);
      }
    } else {
      // Create mode: hold until the product is saved.
      onPendingFilesChange([...pendingFiles, ...files]);
    }
  };

  const handleSetPrimary = async (imageId: string) => {
    if (!productId) return;
    setBusy(true);
    try {
      await marketplaceApi.setPrimaryImage(productId, imageId);
      onChanged?.();
    } catch {
      // handled by interceptor
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteExisting = async (imageId: string) => {
    if (!productId) return;
    setBusy(true);
    try {
      await marketplaceApi.deleteImage(productId, imageId);
      toast.success('Image removed.');
      onChanged?.();
    } catch {
      // handled by interceptor
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePending = (index: number) => {
    onPendingFilesChange(pendingFiles.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">Product images</label>
        <span className="text-xs text-gray-400">
          {totalCount}/{MAX_IMAGES}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {/* Saved images (edit mode) */}
        {images.map((img) => (
          <div
            key={img.id}
            className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
          >
            <img
              src={getMediaUrl(img.url) ?? img.url}
              alt="Product"
              className="h-full w-full object-contain p-1"
            />
            {img.is_primary && (
              <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Primary
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/55 p-1 opacity-0 transition group-hover:opacity-100">
              {!img.is_primary && (
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSetPrimary(img.id)}
                  className="text-[11px] font-medium text-white hover:underline disabled:opacity-60"
                >
                  Make primary
                </button>
              )}
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => handleDeleteExisting(img.id)}
                className="ml-auto text-[11px] font-medium text-red-300 hover:underline disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {/* Pending files (create mode) */}
        {pendingPreviews.map((preview, index) => (
          <div
            key={preview}
            className="group relative aspect-square overflow-hidden rounded-lg border border-dashed border-secondary-300 bg-secondary-50"
          >
            <img src={preview} alt="Pending upload" className="h-full w-full object-contain p-1" />
            <span className="absolute left-1 top-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-white">
              New
            </span>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => handleRemovePending(index)}
              className="absolute inset-x-0 bottom-0 bg-black/55 p-1 text-[11px] font-medium text-red-300 opacity-0 transition hover:underline group-hover:opacity-100 disabled:opacity-60"
            >
              Remove
            </button>
          </div>
        ))}

        {/* Add tile */}
        {totalCount < MAX_IMAGES && (
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-secondary-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-2xl">＋</span>
            <span className="mt-0.5 text-[11px]">{busy ? 'Uploading…' : 'Add images'}</span>
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400">PNG, JPG, or WEBP up to 5 MB each. The primary image is shown in the catalog.</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleSelectFiles}
        disabled={isDisabled}
        className="hidden"
      />
    </div>
  );
}

export default ProductImageManager;
