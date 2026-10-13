import {
  EMPLOYMENT_TYPES,
  type EmployeeCreateInput,
  type EmployeeDetail,
  type EmployeeUpdateInput,
  employeeCreateSchema,
  emailSchema,
  InvalidAmountError,
  type ReferenceData,
  toMinor,
} from '@acme/shared';
import { z } from 'zod';
import { currencyOfCountry } from '@/features/reference/hooks';
import { majorInputValue } from '@/lib/money';

/**
 * Form values are what the inputs hold (strings, major units). They are converted to the shared
 * API contract on submit; field rules reuse the shared schemas wherever they apply.
 */
export function makeEmployeeFormSchema(reference: ReferenceData, original?: EmployeeDetail) {
  const date = z.iso.date('Enter a valid date');
  return z
    .object({
      fullName: employeeCreateSchema.shape.fullName,
      email: emailSchema,
      jobTitleId: z.string().min(1, 'Choose a job title'),
      countryCode: z.string().min(1, 'Choose a country'),
      salary: z.string().trim().min(1, 'Salary is required'),
      employmentType: z.enum(EMPLOYMENT_TYPES, { message: 'Choose an employment type' }),
      hireDate: date,
      effectiveDate: z.union([z.literal(''), date]),
      reason: z.string().trim().max(200, 'Reason must be at most 200 characters'),
    })
    .superRefine((values, context) => {
      const currency = currencyOfCountry(reference, values.countryCode);
      if (!currency) {
        return;
      }
      const salaryIssue = (message: string) =>
        context.addIssue({ code: 'custom', path: ['salary'], message });
      // The old amount is in the old currency, so it must be re-entered before anything else.
      if (
        original &&
        countryChanged(values, original) &&
        !salaryEdited(values, original, reference)
      ) {
        salaryIssue(
          `Changing the country changes the currency: enter the salary in ${currency.code}`,
        );
        return;
      }
      try {
        if (toMinor(values.salary, currency.minorUnit) <= 0) {
          salaryIssue('Salary must be greater than zero');
        }
      } catch (error) {
        salaryIssue(error instanceof InvalidAmountError ? error.message : 'Enter a valid amount');
      }
    });
}

export type EmployeeFormInput = z.input<ReturnType<typeof makeEmployeeFormSchema>>;
export type EmployeeFormValues = z.output<ReturnType<typeof makeEmployeeFormSchema>>;

export function countryChanged(values: { countryCode: string }, original: EmployeeDetail) {
  return values.countryCode !== original.country.code;
}

export function salaryEdited(
  values: { salary: string },
  original: EmployeeDetail,
  reference: ReferenceData,
): boolean {
  return values.salary.trim() !== formValuesFrom(original, reference).salary;
}

export function emptyFormValues(): EmployeeFormInput {
  return {
    fullName: '',
    email: '',
    jobTitleId: '',
    countryCode: '',
    salary: '',
    employmentType: '' as EmployeeFormInput['employmentType'],
    hireDate: '',
    effectiveDate: '',
    reason: '',
  };
}

export function formValuesFrom(
  employee: EmployeeDetail,
  reference: ReferenceData,
): EmployeeFormInput {
  const minorUnit = currencyOfCountry(reference, employee.country.code)?.minorUnit ?? 2;
  return {
    fullName: employee.fullName,
    email: employee.email,
    jobTitleId: String(employee.jobTitle.id),
    countryCode: employee.country.code,
    salary: majorInputValue(employee.salary.amountMinor, minorUnit),
    employmentType: employee.employmentType,
    hireDate: employee.hireDate,
    effectiveDate: '',
    reason: '',
  };
}

function salaryMinorOf(values: EmployeeFormValues, reference: ReferenceData): number {
  const currency = currencyOfCountry(reference, values.countryCode);
  return toMinor(values.salary, currency?.minorUnit ?? 2);
}

export function toCreateInput(
  values: EmployeeFormValues,
  reference: ReferenceData,
): EmployeeCreateInput {
  return {
    fullName: values.fullName,
    email: values.email,
    jobTitleId: Number(values.jobTitleId),
    countryCode: values.countryCode,
    salaryMinor: salaryMinorOf(values, reference),
    employmentType: values.employmentType,
    hireDate: values.hireDate,
  };
}

/** Only changed fields are sent, so an untouched salary never creates a history entry. */
export function toUpdateInput(
  values: EmployeeFormValues,
  original: EmployeeDetail,
  reference: ReferenceData,
): Partial<EmployeeUpdateInput> {
  const salaryMinor = salaryMinorOf(values, reference);
  const salaryChanged =
    salaryMinor !== original.salary.amountMinor || countryChanged(values, original);
  const salaryChange = {
    ...(values.effectiveDate && { effectiveDate: values.effectiveDate }),
    ...(values.reason && { reason: values.reason }),
  };
  return {
    ...(values.fullName !== original.fullName && { fullName: values.fullName }),
    ...(values.email !== original.email && { email: values.email }),
    ...(Number(values.jobTitleId) !== original.jobTitle.id && {
      jobTitleId: Number(values.jobTitleId),
    }),
    ...(countryChanged(values, original) && { countryCode: values.countryCode }),
    ...(salaryChanged && { salaryMinor }),
    ...(values.employmentType !== original.employmentType && {
      employmentType: values.employmentType,
    }),
    ...(values.hireDate !== original.hireDate && { hireDate: values.hireDate }),
    ...(salaryChanged && Object.keys(salaryChange).length > 0 && { salaryChange }),
  };
}

/** API field names that differ from the form's input names. */
export const SERVER_FIELD_TO_FORM: Record<string, keyof EmployeeFormInput> = {
  salaryMinor: 'salary',
};
