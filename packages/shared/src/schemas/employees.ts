import { z } from 'zod';
import {
  EMPLOYEE_SORT_FIELDS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  SORT_ORDERS,
  STATUS_FILTERS,
} from '../enums';
import {
  countryCodeSchema,
  countryRefSchema,
  emailSchema,
  fxMetaSchema,
  fxOnlyMetaSchema,
  isoDateSchema,
  moneySchema,
  namedRefSchema,
  optionalQueryParam,
} from './common';

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

export const employeeListItemSchema = z.object({
  id: idSchema,
  employeeCode: z.string(),
  fullName: z.string(),
  email: z.string(),
  jobTitle: namedRefSchema,
  department: namedRefSchema,
  country: countryRefSchema,
  salary: moneySchema,
  salaryUsd: moneySchema,
  employmentType: z.enum(EMPLOYMENT_TYPES),
  hireDate: isoDateSchema,
  status: z.enum(EMPLOYEE_STATUSES),
  terminatedOn: isoDateSchema.nullable(),
});
export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;

export const salaryHistoryEntrySchema = z.object({
  id: idSchema,
  previous: moneySchema.nullable(),
  new: moneySchema,
  effectiveDate: isoDateSchema,
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type SalaryHistoryEntry = z.infer<typeof salaryHistoryEntrySchema>;

export const employeeDetailSchema = employeeListItemSchema.extend({
  salaryHistory: z.array(salaryHistoryEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

export const employeeListMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  fx: fxMetaSchema,
});
export type EmployeeListMeta = z.infer<typeof employeeListMetaSchema>;

export const employeeListResponseSchema = z.object({
  data: z.array(employeeListItemSchema),
  meta: employeeListMetaSchema,
});
export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>;

export const employeeDetailResponseSchema = z.object({
  data: employeeDetailSchema,
  meta: fxOnlyMetaSchema,
});
export type EmployeeDetailResponse = z.infer<typeof employeeDetailResponseSchema>;
