import { z } from 'zod';
import { EMPLOYEE_SORT_FIELDS, EMPLOYMENT_TYPES, SORT_ORDERS, STATUS_FILTERS } from '../enums';
import { countryCodeSchema, emailSchema, isoDateSchema, optionalQueryParam } from './common';

const idSchema = z.number().int().positive();

const employeeFields = {
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email: emailSchema,
  jobTitleId: idSchema,
  countryCode: countryCodeSchema,
  salaryMinor: z.number().int().positive('Salary must be greater than zero'),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  hireDate: isoDateSchema,
};

// Strict objects: the server derives currency, code, status and department, so clients must not send them.
export const employeeCreateSchema = z.strictObject(employeeFields);
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const salaryChangeAnnotationSchema = z.strictObject({
  effectiveDate: isoDateSchema.optional(),
  reason: z.string().trim().max(200).optional(),
});

export const employeeUpdateSchema = z
  .strictObject({
    ...z.object(employeeFields).partial().shape,
    salaryChange: salaryChangeAnnotationSchema.optional(),
  })
  .refine((update) => Object.keys(update).length > 0, { message: 'No changes provided' });
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

export const terminateEmployeeSchema = z.strictObject({ terminatedOn: isoDateSchema });
export type TerminateEmployeeInput = z.infer<typeof terminateEmployeeSchema>;

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: optionalQueryParam(z.string().trim().max(100)),
  country: optionalQueryParam(countryCodeSchema),
  departmentId: optionalQueryParam(z.coerce.number().int().positive()),
  jobTitleId: optionalQueryParam(z.coerce.number().int().positive()),
  employmentType: optionalQueryParam(z.enum(EMPLOYMENT_TYPES)),
  status: z.enum(STATUS_FILTERS).default('active'),
  sort: z.enum(EMPLOYEE_SORT_FIELDS).default('fullName'),
  order: z.enum(SORT_ORDERS).default('asc'),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
