import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { authApi } from '@/api';
import { extractErrorMessage } from '@/api/axiosConfig';
import { useResendVerification } from '@/hooks/useAuth';
import type { RegistrationRequest } from '@/types';
import type { AxiosError } from 'axios';
import type { ApiErrorResponse } from '@/types';

interface SupplierKycProps {
  /** Base registration payload (without nida/answers). */
  payload: RegistrationRequest;
  nidaId: string;
  onBack: () => void;
}

/** Simulated NIDA identity verification — free-text security questions, one at a time. */
export function SupplierKyc({ payload, nidaId, onBack }: SupplierKycProps) {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);
  const resendVerification = useResendVerification();

  const questionsQuery = useQuery({
    queryKey: ['kycQuestions', nidaId],
    queryFn: async () => {
      const { data } = await authApi.kycQuestions(nidaId);
      return data;
    },
  });

  const registerMutation = useMutation({
    mutationFn: () => authApi.register({ ...payload, nida_id: nidaId, kyc_answers: answers }),
    onSuccess: (response) => {
      // Capture the email for the success banner + Resend action. The
      // register response is the new user's `User` payload.
      setDoneEmail(response.data?.email || payload.email);
    },
    onError: (error: AxiosError<ApiErrorResponse>) => {
      toast.error(extractErrorMessage(error));
    },
  });

  const handleResend = () => {
    if (!doneEmail) return;
    resendVerification.mutate(doneEmail, {
      onSuccess: () => toast.success('Verification email sent. Check your inbox.'),
      onError: () => toast.error('Could not resend. Please try again.'),
    });
  };

  // Success state: persistent banner that explains verification is still
  // required (not just a toast that disappears in 4 seconds).
  if (doneEmail) {
    return (
      <div className="space-y-5">
        <div
          role="status"
          className="rounded-lg border border-primary-200 bg-primary-50 p-5 text-sm text-primary-900"
        >
          <p className="text-base font-semibold">✅ Identity verified!</p>
          <p className="mt-2 text-primary-800">
            Your supplier account is created. We&apos;ve emailed a verification link to{' '}
            <span className="font-semibold">{doneEmail}</span> — you won&apos;t be able to sign
            in until you click it. The link expires in 24 hours.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendVerification.isPending}
              className="rounded-md border border-primary bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-100 disabled:opacity-60"
            >
              {resendVerification.isPending ? 'Sending…' : 'Resend verification email'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/login?justRegistered=1&email=${encodeURIComponent(doneEmail)}`)}
              className="rounded-md border border-transparent bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
            >
              Go to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  const challenge = questionsQuery.data;

  if (questionsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-2/3 animate-pulse rounded bg-gray-100" />
        <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  if (questionsQuery.isError || !challenge) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">
          {extractErrorMessage(questionsQuery.error as AxiosError<ApiErrorResponse>)}
        </p>
        <button type="button" onClick={onBack} className="text-sm text-primary hover:underline">
          ← Back to registration details
        </button>
      </div>
    );
  }

  const questions = challenge.questions;
  const current = questions[index];
  if (!current) return null;
  const isLast = index === questions.length - 1;
  const currentAnswer = answers[current.id] ?? '';
  const canProceed = currentAnswer.trim().length > 0;

  const goNext = () => {
    if (isLast) {
      registerMutation.mutate();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const goBack = () => {
    if (index === 0) {
      onBack();
    } else {
      setIndex((i) => i - 1);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-primary-100 bg-primary-50 p-4">
        <h2 className="text-sm font-semibold text-primary">NIDA identity verification</h2>
        <p className="mt-1 text-sm text-gray-600">
          Verifying NIDA <span className="font-medium">{challenge.nida_masked}</span>. Answer the
          security questions — you need at least{' '}
          <span className="font-semibold">{challenge.required_correct}</span> of {challenge.total}{' '}
          correct.
        </p>
      </div>

      {/* progress dots */}
      <div className="flex items-center gap-2">
        {questions.map((q, i) => (
          <span
            key={q.id}
            className={`h-1.5 flex-1 rounded-full ${
              i < index ? 'bg-secondary' : i === index ? 'bg-primary' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          Question {index + 1} of {questions.length}
        </p>
        <label htmlFor={current.id} className="block text-base font-medium text-gray-900">
          {current.prompt}
        </label>
        <input
          id={current.id}
          autoFocus
          value={currentAnswer}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canProceed && !registerMutation.isPending) {
              e.preventDefault();
              goNext();
            }
          }}
          placeholder="Type your answer…"
          className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={registerMutation.isPending}
          className="flex-1 rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {index === 0 ? 'Back' : 'Previous'}
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!canProceed || registerMutation.isPending}
          className="flex-1 rounded-lg bg-primary py-2.5 font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {registerMutation.isPending
            ? 'Verifying…'
            : isLast
              ? 'Verify & create account'
              : 'Next'}
        </button>
      </div>
    </div>
  );
}

export default SupplierKyc;
