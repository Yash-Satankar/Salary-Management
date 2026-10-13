'use client';

import {
  EMPLOYMENT_TYPES,
  type EmployeeCreateInput,
  type EmployeeDetail,
  type EmployeeUpdateInput,
  type ReferenceData,
} from '@acme/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { type FieldErrors, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { currencyOfCountry } from '@/features/reference/hooks';
import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import { EMPLOYMENT_TYPE_LABELS } from '../labels';
import {
  countryChanged,
  type EmployeeFormInput,
  type EmployeeFormValues,
  emptyFormValues,
  formValuesFrom,
  makeEmployeeFormSchema,
  SERVER_FIELD_TO_FORM,
  salaryEdited,
  toCreateInput,
  toUpdateInput,
} from '../form-schema';

type EmployeeFormProps = { reference: ReferenceData; onCancel?: () => void } & (
  | { employee?: undefined; onSubmit: (input: EmployeeCreateInput) => Promise<unknown> }
  | { employee: EmployeeDetail; onSubmit: (input: EmployeeUpdateInput) => Promise<unknown> }
);

const FORM_FIELDS = new Set<string>(Object.keys(emptyFormValues()));

export function EmployeeForm(props: EmployeeFormProps) {
  const { reference, employee } = props;
  const schema = useMemo(() => makeEmployeeFormSchema(reference, employee), [reference, employee]);
  const form = useForm<EmployeeFormInput, unknown, EmployeeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: employee ? formValuesFrom(employee, reference) : emptyFormValues(),
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  const [countryCode, salary] = useWatch({ control, name: ['countryCode', 'salary'] });
  const currency = currencyOfCountry(reference, countryCode);
  const countryHasChanged = employee !== undefined && countryChanged({ countryCode }, employee);
  const showSalaryChange =
    employee !== undefined &&
    (countryHasChanged || salaryEdited({ salary: salary ?? '' }, employee, reference));

  const showServerErrors = (error: unknown) => {
    const fieldErrors = fieldErrorsOf(error);
    let mappedAny = false;
    for (const [serverField, messages] of Object.entries(fieldErrors)) {
      const field = SERVER_FIELD_TO_FORM[serverField] ?? serverField;
      if (FORM_FIELDS.has(field) && messages[0]) {
        setError(field as keyof EmployeeFormInput, { message: messages[0] });
        mappedAny = true;
      }
    }
    if (!mappedAny) {
      setError('root', {
        message: error instanceof ApiError ? error.message : 'Saving failed. Please try again.',
      });
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (props.employee) {
        const changes = toUpdateInput(values, props.employee, reference);
        if (Object.keys(changes).length === 0) {
          setError('root', { message: 'There are no changes to save.' });
          return;
        }
        await props.onSubmit(changes as EmployeeUpdateInput);
      } else {
        await props.onSubmit(toCreateInput(values, reference));
      }
    } catch (error) {
      showServerErrors(error);
    }
  });

  const salaryLabel = `Annual salary (${currency?.code ?? 'choose a country'})`;
  const salaryHint =
    currency === undefined
      ? 'Choose a country first; the currency follows the country.'
      : currency.minorUnit === 0
        ? `Whole ${currency.code}, no decimals.`
        : `In ${currency.name}, up to ${currency.minorUnit} decimals.`;

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fullName" label="Full name" errors={errors}>
          <Input
            id="fullName"
            autoComplete="off"
            {...ariaInvalid(errors, 'fullName')}
            {...register('fullName')}
          />
        </Field>
        <Field id="email" label="Email" errors={errors}>
          <Input
            id="email"
            type="email"
            autoComplete="off"
            {...ariaInvalid(errors, 'email')}
            {...register('email')}
          />
        </Field>
        <Field id="jobTitleId" label="Job title" errors={errors}>
          <NativeSelect
            id="jobTitleId"
            className="w-full"
            {...ariaInvalid(errors, 'jobTitleId')}
            {...register('jobTitleId')}
          >
            <NativeSelectOption value="">Select…</NativeSelectOption>
            {reference.departments.map((department) => (
              <NativeSelectOptGroup key={department.id} label={department.name}>
                {reference.jobTitles
                  .filter((title) => title.departmentId === department.id)
                  .map((title) => (
                    <NativeSelectOption key={title.id} value={String(title.id)}>
                      {title.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelectOptGroup>
            ))}
          </NativeSelect>
        </Field>
        <Field id="countryCode" label="Country" errors={errors}>
          <NativeSelect
            id="countryCode"
            className="w-full"
            {...ariaInvalid(errors, 'countryCode')}
            {...register('countryCode')}
          >
            <NativeSelectOption value="">Select…</NativeSelectOption>
            {reference.countries.map((country) => (
              <NativeSelectOption key={country.code} value={country.code}>
                {country.name} ({country.currency.code})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field id="salary" label={salaryLabel} hint={salaryHint} errors={errors}>
          <Input
            id="salary"
            inputMode="decimal"
            autoComplete="off"
            {...ariaInvalid(errors, 'salary')}
            {...register('salary')}
          />
        </Field>
        <Field id="employmentType" label="Employment type" errors={errors}>
          <NativeSelect
            id="employmentType"
            className="w-full"
            {...ariaInvalid(errors, 'employmentType')}
            {...register('employmentType')}
          >
            <NativeSelectOption value="">Select…</NativeSelectOption>
            {EMPLOYMENT_TYPES.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {EMPLOYMENT_TYPE_LABELS[type]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field id="hireDate" label="Hire date" errors={errors}>
          <Input
            id="hireDate"
            type="date"
            {...ariaInvalid(errors, 'hireDate')}
            {...register('hireDate')}
          />
        </Field>
      </div>

      {countryHasChanged && currency && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          Currency will change — enter the salary in {currency.code}
        </p>
      )}

      {showSalaryChange && (
        <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">Salary change</legend>
          <Field
            id="effectiveDate"
            label="Effective date"
            hint="Defaults to today."
            errors={errors}
          >
            <Input
              id="effectiveDate"
              type="date"
              {...ariaInvalid(errors, 'effectiveDate')}
              {...register('effectiveDate')}
            />
          </Field>
          <Field id="reason" label="Reason" hint="Optional, e.g. Annual review." errors={errors}>
            <Textarea
              id="reason"
              rows={2}
              {...ariaInvalid(errors, 'reason')}
              {...register('reason')}
            />
          </Field>
        </fieldset>
      )}

      {errors.root && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {employee ? 'Save changes' : 'Create employee'}
        </Button>
        {props.onCancel && (
          <Button type="button" variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function ariaInvalid(errors: FieldErrors<EmployeeFormInput>, field: keyof EmployeeFormInput) {
  return { 'aria-invalid': errors[field] ? true : undefined };
}

interface FieldProps {
  id: keyof EmployeeFormInput;
  label: string;
  hint?: string;
  errors: FieldErrors<EmployeeFormInput>;
  children: ReactNode;
}

function Field({ id, label, hint, errors, children }: FieldProps) {
  const message = errors[id]?.message;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {message ? (
        <p className="text-sm text-destructive">{message}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
