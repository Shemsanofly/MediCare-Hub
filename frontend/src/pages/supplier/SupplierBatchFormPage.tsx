import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { marketplaceApi } from '@/api';
import { extractErrorMessage } from '@/api/axiosConfig';
import ErrorMessage from '@/components/dashboard/ErrorMessage';
import LoadingSpinner from '@/components/dashboard/LoadingSpinner';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

const SupplierBatchFormPage = () => {
  const { productId, batchId } = useParams<{
    productId: string;
    batchId?: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(batchId);

  const batchesQuery = useQuery({
    queryKey: ['productBatches', productId],
    queryFn: async () => {
      const { data } = await marketplaceApi.listBatches(productId!);
      return data.results;
    },
    enabled: Boolean(productId) && isEdit,
  });

  const existingBatch = batchesQuery.data?.find((batch) => batch.id === batchId);

  const [form, setForm] = useState({
    batch_number: '',
    manufacturing_date: '',
    expiry_date: '',
    quantity: '0',
    unit_cost: '0',
    storage_conditions: '',
    tmda_batch_cert_number: '',
  });

  useEffect(() => {
    if (!existingBatch) return;
    setForm({
      batch_number: existingBatch.batch_number,
      manufacturing_date:
        existingBatch.manufacturing_date ?? existingBatch.manufacture_date ?? '',
      expiry_date: existingBatch.expiry_date,
      quantity: String(existingBatch.quantity ?? 0),
      unit_cost: String(existingBatch.unit_cost ?? '0'),
      storage_conditions: existingBatch.storage_conditions ?? '',
      tmda_batch_cert_number: existingBatch.tmda_batch_cert_number ?? '',
    });
  }, [existingBatch]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        batch_number: form.batch_number.trim(),
        manufacturing_date: form.manufacturing_date,
        expiry_date: form.expiry_date,
        quantity: Number(form.quantity),
        unit_cost: form.unit_cost,
        storage_conditions: form.storage_conditions,
        tmda_batch_cert_number: form.tmda_batch_cert_number,
      };
      if (isEdit && batchId) {
        return marketplaceApi.updateBatch(batchId, payload);
      }
      return marketplaceApi.createBatch(productId!, payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Batch updated.' : 'Batch created.');
      void queryClient.invalidateQueries({ queryKey: ['productBatches', productId] });
      void queryClient.invalidateQueries({ queryKey: ['supplierProducts'] });
      navigate(`/supplier/products/${productId}/batches`);
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  if (isEdit && batchesQuery.isLoading) {
    return <LoadingSpinner label="Loading batch…" />;
  }

  if (isEdit && batchesQuery.isError) {
    return (
      <ErrorMessage
        message={extractErrorMessage(batchesQuery.error as AxiosError<ApiErrorResponse>)}
        onRetry={() => void batchesQuery.refetch()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to={`/supplier/products/${productId}/batches`}
          className="text-sm text-primary hover:underline"
        >
          ← Back to batches
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit batch' : 'Add batch'}
        </h1>
      </div>

      <form
        className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Batch number
          </label>
          <input
            required
            value={form.batch_number}
            onChange={(event) =>
              setForm((current) => ({ ...current, batch_number: event.target.value }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Manufacturing date
            </label>
            <input
              required
              type="date"
              value={form.manufacturing_date}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  manufacturing_date: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Expiry date
            </label>
            <input
              required
              type="date"
              value={form.expiry_date}
              onChange={(event) =>
                setForm((current) => ({ ...current, expiry_date: event.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Quantity
            </label>
            <input
              required
              type="number"
              min={0}
              value={form.quantity}
              onChange={(event) =>
                setForm((current) => ({ ...current, quantity: event.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Unit cost (TZS)
            </label>
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={form.unit_cost}
              onChange={(event) =>
                setForm((current) => ({ ...current, unit_cost: event.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Storage conditions
          </label>
          <input
            value={form.storage_conditions}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                storage_conditions: event.target.value,
              }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            TMDA batch certificate
          </label>
          <input
            value={form.tmda_batch_cert_number}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                tmda_batch_cert_number: event.target.value,
              }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
        >
          {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create batch'}
        </button>
      </form>
    </div>
  );
};

export default SupplierBatchFormPage;
