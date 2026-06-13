import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import PasswordStrengthIndicator from '@/components/auth/PasswordStrengthIndicator';
import { useRegister } from '@/hooks/useAuth';
import type { RegistrationRequest } from '@/types';
import {
  registerStep1Schema,
  registerStep2Schema,
  registerStep3HospitalSchema,
  registerStep3SupplierSchema,
  type RegisterFormValues,
  type RegisterStep1Values,
  type RegisterStep2Values,
} from '@/utils/validationSchemas';

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const labelClassName = 'mb-1 block text-sm font-medium text-gray-700';
const errorClassName = 'mt-1 text-sm text-red-600';

const STEPS = ['Personal details', 'Organisation', 'Role-specific'];

/** Multi-step registration for hospitals and suppliers. */
const Register = () => {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<Partial<RegisterFormValues>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const registerMutation = useRegister();

  const step1Form = useForm<RegisterStep1Values>({
    resolver: zodResolver(registerStep1Schema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const step2Form = useForm<RegisterStep2Values>({
    resolver: zodResolver(registerStep2Schema),
    defaultValues: {
      role: 'HOSPITAL',
      organisation_name: '',
      organisation_type: 'HOSPITAL',
      registration_number: '',
    },
  });

  const role = step2Form.watch('role');
  const password = step1Form.watch('password');

  const step3Form = useForm({
    resolver: zodResolver(
      role === 'SUPPLIER' ? registerStep3SupplierSchema : registerStep3HospitalSchema,
    ),
    defaultValues:
      role === 'SUPPLIER'
        ? { tmda_license: '', brela_registration: '', delivery_regions: '' }
        : { facility_type: '', bed_capacity: 0, procurement_contact: '' },
  });

  const handleStep1Next = step1Form.handleSubmit((values) => {
    setFormData((prev) => ({ ...prev, ...values }));
    setStep(1);
  });

  const handleStep2Next = step2Form.handleSubmit((values) => {
    setFormData((prev) => ({ ...prev, ...values }));
    setStep(2);
  });

  const handleSubmit = step3Form.handleSubmit(async (values) => {
    const merged = { ...formData, ...values } as RegisterFormValues;
    const { confirmPassword: _, ...payload } = merged;

    const registrationPayload: RegistrationRequest = {
      email: payload.email,
      password: payload.password,
      first_name: payload.first_name,
      last_name: payload.last_name,
      role: payload.role,
      organisation_name: payload.organisation_name,
      organisation_type: payload.organisation_type,
      registration_number: payload.registration_number || undefined,
      tmda_license: payload.tmda_license || undefined,
    };

    setIsSubmitting(true);
    try {
      await registerMutation.mutate(registrationPayload);
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-secondary-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary">Create an account</h1>
          <p className="mt-2 text-sm text-gray-500">
            Register your organisation on MediCare Hub
          </p>
        </div>

        <div className="mb-8 flex justify-between">
          {STEPS.map((label, index) => (
            <div key={label} className="flex flex-1 flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  index <= step
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {index + 1}
              </div>
              <span className="mt-1 hidden text-xs text-gray-500 sm:block">{label}</span>
            </div>
          ))}
        </div>

        {step === 0 && (
          <form onSubmit={handleStep1Next} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className={labelClassName}>First name</label>
                <input id="first_name" className={inputClassName} {...step1Form.register('first_name')} />
                {step1Form.formState.errors.first_name && (
                  <p className={errorClassName}>{step1Form.formState.errors.first_name.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="last_name" className={labelClassName}>Last name</label>
                <input id="last_name" className={inputClassName} {...step1Form.register('last_name')} />
                {step1Form.formState.errors.last_name && (
                  <p className={errorClassName}>{step1Form.formState.errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="email" className={labelClassName}>Email</label>
              <input id="email" type="email" className={inputClassName} {...step1Form.register('email')} />
              {step1Form.formState.errors.email && (
                <p className={errorClassName}>{step1Form.formState.errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className={labelClassName}>Password</label>
              <input id="password" type="password" className={inputClassName} {...step1Form.register('password')} />
              <PasswordStrengthIndicator password={password} />
              {step1Form.formState.errors.password && (
                <p className={errorClassName}>{step1Form.formState.errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className={labelClassName}>Confirm password</label>
              <input id="confirmPassword" type="password" className={inputClassName} {...step1Form.register('confirmPassword')} />
              {step1Form.formState.errors.confirmPassword && (
                <p className={errorClassName}>{step1Form.formState.errors.confirmPassword.message}</p>
              )}
            </div>

            <button type="submit" className="w-full rounded-lg bg-primary py-2.5 font-semibold text-white hover:bg-primary-600">
              Continue
            </button>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={handleStep2Next} className="space-y-4" noValidate>
            <div>
              <label htmlFor="role" className={labelClassName}>Account type</label>
              <select id="role" className={inputClassName} {...step2Form.register('role')}>
                <option value="HOSPITAL">Hospital / Healthcare facility</option>
                <option value="SUPPLIER">Medical supplier</option>
              </select>
            </div>

            <div>
              <label htmlFor="organisation_name" className={labelClassName}>Organisation name</label>
              <input id="organisation_name" className={inputClassName} {...step2Form.register('organisation_name')} />
              {step2Form.formState.errors.organisation_name && (
                <p className={errorClassName}>{step2Form.formState.errors.organisation_name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="organisation_type" className={labelClassName}>Organisation type</label>
              <select id="organisation_type" className={inputClassName} {...step2Form.register('organisation_type')}>
                <option value="HOSPITAL">Hospital</option>
                <option value="SUPPLIER">Supplier</option>
                <option value="PHARMACY">Pharmacy</option>
                <option value="LAB">Laboratory</option>
              </select>
            </div>

            <div>
              <label htmlFor="registration_number" className={labelClassName}>
                Registration number <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input id="registration_number" className={inputClassName} {...step2Form.register('registration_number')} />
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(0)} className="flex-1 rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 hover:bg-gray-50">
                Back
              </button>
              <button type="submit" className="flex-1 rounded-lg bg-primary py-2.5 font-semibold text-white hover:bg-primary-600">
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <p className="text-sm text-gray-600">
              {role === 'SUPPLIER'
                ? 'Provide supplier licensing and delivery information.'
                : 'Tell us about your healthcare facility.'}
            </p>

            {role === 'HOSPITAL' ? (
              <>
                <div>
                  <label htmlFor="facility_type" className={labelClassName}>Facility type</label>
                  <select id="facility_type" className={inputClassName} {...step3Form.register('facility_type')}>
                    <option value="">Select type</option>
                    <option value="GENERAL">General hospital</option>
                    <option value="DISTRICT">District hospital</option>
                    <option value="CLINIC">Clinic / health centre</option>
                    <option value="SPECIALIST">Specialist facility</option>
                  </select>
                  {'facility_type' in step3Form.formState.errors && step3Form.formState.errors.facility_type && (
                    <p className={errorClassName}>{String(step3Form.formState.errors.facility_type.message)}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="bed_capacity" className={labelClassName}>Bed capacity</label>
                  <input id="bed_capacity" type="number" min={1} className={inputClassName} {...step3Form.register('bed_capacity')} />
                  {'bed_capacity' in step3Form.formState.errors && step3Form.formState.errors.bed_capacity && (
                    <p className={errorClassName}>{String(step3Form.formState.errors.bed_capacity.message)}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="procurement_contact" className={labelClassName}>Procurement contact</label>
                  <input id="procurement_contact" className={inputClassName} {...step3Form.register('procurement_contact')} />
                  {'procurement_contact' in step3Form.formState.errors && step3Form.formState.errors.procurement_contact && (
                    <p className={errorClassName}>{String(step3Form.formState.errors.procurement_contact.message)}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="tmda_license" className={labelClassName}>TMDA license</label>
                  <input id="tmda_license" className={inputClassName} {...step3Form.register('tmda_license')} />
                  {'tmda_license' in step3Form.formState.errors && step3Form.formState.errors.tmda_license && (
                    <p className={errorClassName}>{String(step3Form.formState.errors.tmda_license.message)}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="brela_registration" className={labelClassName}>BRELA registration</label>
                  <input id="brela_registration" className={inputClassName} {...step3Form.register('brela_registration')} />
                  {'brela_registration' in step3Form.formState.errors && step3Form.formState.errors.brela_registration && (
                    <p className={errorClassName}>{String(step3Form.formState.errors.brela_registration.message)}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="delivery_regions" className={labelClassName}>Delivery regions</label>
                  <input id="delivery_regions" placeholder="e.g. Dar es Salaam, Arusha" className={inputClassName} {...step3Form.register('delivery_regions')} />
                  {'delivery_regions' in step3Form.formState.errors && step3Form.formState.errors.delivery_regions && (
                    <p className={errorClassName}>{String(step3Form.formState.errors.delivery_regions.message)}</p>
                  )}
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 hover:bg-gray-50">
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-primary py-2.5 font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
              >
                {isSubmitting ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:text-primary-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
