import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { useRegister } from '@/hooks/useAuth';
import { registerSchema, type RegisterFormValues } from '@/utils/validationSchemas';

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const labelClassName = 'mb-1 block text-sm font-medium text-gray-700';

const errorClassName = 'mt-1 text-sm text-red-600';

/** Self-service registration form for hospitals and suppliers. */
const RegisterForm = () => {
  const registerMutation = useRegister();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
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
    },
  });

  const role = watch('role');

  useEffect(() => {
    setValue('organisation_type', role === 'SUPPLIER' ? 'SUPPLIER' : 'HOSPITAL');
  }, [role, setValue]);

  const onSubmit = (values: RegisterFormValues) => {
    const { confirmPassword: _, ...payload } = values;
    registerMutation.mutate({
      ...payload,
      registration_number: payload.registration_number || undefined,
      tmda_license: payload.tmda_license || undefined,
    });
  };

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
        {registerMutation.isPending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
};

export default RegisterForm;
