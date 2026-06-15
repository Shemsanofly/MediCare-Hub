import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { useRegister } from '@/hooks/useAuth';
import { SupplierKyc } from '@/components/auth/SupplierKyc';
import { registerSchema, type RegisterFormValues } from '@/utils/validationSchemas';
import type { RegistrationRequest } from '@/types';

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const labelClassName = 'mb-1 block text-sm font-medium text-gray-700';

const errorClassName = 'mt-1 text-sm text-red-600';

/** Self-service registration form for hospitals and suppliers. */
const RegisterForm = () => {
  const registerMutation = useRegister();

  // When set, the supplier moves to the NIDA KYC step before the account is created.
  const [kyc, setKyc] = useState<{ payload: RegistrationRequest; nida: string } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'HOSPITAL',
      organisation_name: '',
      organisation_type: 'HOSPITAL',
      registration_number: '',
      tmda_license: '',
      nida_id: '',
    },
  });

  const role = watch('role');

  useEffect(() => {
    setValue('organisation_type', role === 'SUPPLIER' ? 'SUPPLIER' : 'HOSPITAL');
  }, [role, setValue]);

  const onSubmit = (values: RegisterFormValues) => {
    const payload: RegistrationRequest = {
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email,
      password: values.password,
      role: values.role,
      organisation_name: values.organisation_name,
      organisation_type: values.organisation_type,
      registration_number: values.registration_number || undefined,
      tmda_license: values.tmda_license || undefined,
    };

    if (values.role === 'SUPPLIER') {
      const nida = (values.nida_id ?? '').replace(/\s/g, '');
      if (!/^\d{20}$/.test(nida)) {
        setError('nida_id', { message: 'NIDA number must be exactly 20 digits' });
        return;
      }
      setKyc({ payload, nida });
      return;
    }

    registerMutation.mutate(payload);
  };

  if (kyc) {
    return <SupplierKyc payload={kyc.payload} nidaId={kyc.nida} onBack={() => setKyc(null)} />;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="first_name" className={labelClassName}>
            First name
          </label>
          <input
            id="first_name"
            type="text"
            autoComplete="given-name"
            className={inputClassName}
            {...register('first_name')}
          />
          {errors.first_name && (
            <p className={errorClassName}>{errors.first_name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="last_name" className={labelClassName}>
            Last name
          </label>
          <input
            id="last_name"
            type="text"
            autoComplete="family-name"
            className={inputClassName}
            {...register('last_name')}
          />
          {errors.last_name && (
            <p className={errorClassName}>{errors.last_name.message}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="email" className={labelClassName}>
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className={inputClassName}
          {...register('email')}
        />
        {errors.email && (
          <p className={errorClassName}>{errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="role" className={labelClassName}>
          Account type
        </label>
        <select id="role" className={inputClassName} {...register('role')}>
          <option value="HOSPITAL">Hospital / Healthcare facility</option>
          <option value="SUPPLIER">Medical supplier</option>
        </select>
        {errors.role && (
          <p className={errorClassName}>{errors.role.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="organisation_name" className={labelClassName}>
          Organisation name
        </label>
        <input
          id="organisation_name"
          type="text"
          autoComplete="organization"
          className={inputClassName}
          {...register('organisation_name')}
        />
        {errors.organisation_name && (
          <p className={errorClassName}>{errors.organisation_name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="organisation_type" className={labelClassName}>
          Organisation type
        </label>
        <select
          id="organisation_type"
          className={inputClassName}
          {...register('organisation_type')}
        >
          <option value="HOSPITAL">Hospital</option>
          <option value="SUPPLIER">Supplier</option>
          <option value="PHARMACY">Pharmacy</option>
          <option value="LAB">Laboratory</option>
        </select>
        {errors.organisation_type && (
          <p className={errorClassName}>{errors.organisation_type.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="registration_number" className={labelClassName}>
          Registration number
          <span className="font-normal text-gray-400"> (optional)</span>
        </label>
        <input
          id="registration_number"
          type="text"
          className={inputClassName}
          {...register('registration_number')}
        />
      </div>

      {role === 'SUPPLIER' && (
        <div>
          <label htmlFor="tmda_license" className={labelClassName}>
            TMDA license
            <span className="font-normal text-gray-400"> (optional)</span>
          </label>
          <input
            id="tmda_license"
            type="text"
            className={inputClassName}
            {...register('tmda_license')}
          />
        </div>
      )}

      {role === 'SUPPLIER' && (
        <div>
          <label htmlFor="nida_id" className={labelClassName}>
            National ID (NIDA) number
          </label>
          <input
            id="nida_id"
            type="text"
            inputMode="numeric"
            maxLength={20}
            placeholder="20-digit NIDA number"
            className={inputClassName}
            {...register('nida_id')}
          />
          {errors.nida_id ? (
            <p className={errorClassName}>{errors.nida_id.message as string}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-400">
              You&apos;ll verify your identity with NIDA security questions in the next step.
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="password" className={labelClassName}>
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          className={inputClassName}
          {...register('password')}
        />
        {errors.password && (
          <p className={errorClassName}>{errors.password.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword" className={labelClassName}>
          Confirm password
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          className={inputClassName}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p className={errorClassName}>{errors.confirmPassword.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={registerMutation.isPending}
        className="w-full rounded-lg bg-primary py-2.5 font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {registerMutation.isPending
          ? 'Creating account…'
          : role === 'SUPPLIER'
            ? 'Continue to identity verification'
            : 'Create account'}
      </button>
    </form>
  );
};

export default RegisterForm;
