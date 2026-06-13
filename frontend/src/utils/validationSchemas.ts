import { z } from 'zod';

/** Login form validation schema. */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/** Step 1 — personal details. */
export const registerStep1Schema = z
  .object({
    first_name: z.string().min(1, 'First name is required'),
    last_name: z.string().min(1, 'Last name is required'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Enter a valid email address'),
    password: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterStep1Values = z.infer<typeof registerStep1Schema>;

/** Step 2 — organisation details. */
export const registerStep2Schema = z.object({
  role: z.enum(['HOSPITAL', 'SUPPLIER'], {
    required_error: 'Select an account type',
  }),
  organisation_name: z.string().min(1, 'Organisation name is required'),
  organisation_type: z.enum(['HOSPITAL', 'SUPPLIER', 'PHARMACY', 'LAB'], {
    required_error: 'Select an organisation type',
  }),
  registration_number: z.string().optional(),
});

export type RegisterStep2Values = z.infer<typeof registerStep2Schema>;

/** Step 3 — role-specific fields. */
export const registerStep3HospitalSchema = z.object({
  facility_type: z.string().min(1, 'Facility type is required'),
  bed_capacity: z.coerce.number().min(1, 'Bed capacity must be at least 1'),
  procurement_contact: z.string().min(1, 'Procurement contact is required'),
});

export const registerStep3SupplierSchema = z.object({
  tmda_license: z.string().min(1, 'TMDA license is required'),
  brela_registration: z.string().min(1, 'BRELA registration is required'),
  delivery_regions: z.string().min(1, 'Delivery regions are required'),
});

export type RegisterStep3HospitalValues = z.infer<typeof registerStep3HospitalSchema>;
export type RegisterStep3SupplierValues = z.infer<typeof registerStep3SupplierSchema>;

export type RegisterFormValues = RegisterStep1Values &
  RegisterStep2Values &
  Partial<RegisterStep3HospitalValues> &
  Partial<RegisterStep3SupplierValues>;

/** Combined registration schema for final validation. */
export const registerSchema = registerStep1Schema
  .and(registerStep2Schema)
  .and(
    z.object({
      facility_type: z.string().optional(),
      bed_capacity: z.coerce.number().optional(),
      procurement_contact: z.string().optional(),
      tmda_license: z.string().optional(),
      brela_registration: z.string().optional(),
      delivery_regions: z.string().optional(),
    }),
  );
