import type { EmployeeDetail, ReferenceData } from '@acme/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { renderWithProviders } from '@/test/render';
import { EmployeeForm } from './components/employee-form';

const reference: ReferenceData = {
  countries: [
    { code: 'IN', name: 'India', currency: { code: 'INR', name: 'Indian Rupee', minorUnit: 2 } },
    { code: 'JP', name: 'Japan', currency: { code: 'JPY', name: 'Japanese Yen', minorUnit: 0 } },
  ],
  departments: [
    { id: 1, name: 'Engineering' },
    { id: 2, name: 'People' },
  ],
  jobTitles: [
    { id: 1, name: 'Software Engineer', departmentId: 1 },
    { id: 3, name: 'Recruiter', departmentId: 2 },
  ],
  fx: { asOf: '2026-10-01', source: 'Static', rates: { INR: '0.0115', JPY: '0.0067' } },
};

const asha: EmployeeDetail = {
  id: 1,
  employeeCode: 'EMP-000001',
  fullName: 'Asha Rao',
  email: 'asha.rao@acme.test',
  jobTitle: { id: 1, name: 'Software Engineer' },
  department: { id: 1, name: 'Engineering' },
  country: { code: 'IN', name: 'India' },
  salary: { amountMinor: 250_000_000, currency: 'INR' },
  salaryUsd: { amountMinor: 2_875_000, currency: 'USD' },
  employmentType: 'full_time',
  hireDate: '2021-04-01',
  status: 'active',
  terminatedOn: null,
  salaryHistory: [],
  createdAt: '2026-10-13T09:00:00.000Z',
  updatedAt: '2026-10-13T09:00:00.000Z',
};

async function fillNewHire(
  user: ReturnType<typeof userEvent.setup>,
  salary: string,
  country = 'JP',
) {
  await user.type(screen.getByLabelText('Full name'), 'Chika Tanaka');
  await user.type(screen.getByLabelText('Email'), 'Chika@Acme.test');
  await user.selectOptions(screen.getByLabelText('Job title'), '1');
  await user.selectOptions(screen.getByLabelText('Country'), country);
  await user.type(screen.getByLabelText(/Annual salary/), salary);
  await user.selectOptions(screen.getByLabelText('Employment type'), 'full_time');
  await user.type(screen.getByLabelText('Hire date'), '2022-01-10');
}

describe('EmployeeForm (create)', () => {
  it('labels the salary with the currency of the selected country', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EmployeeForm reference={reference} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/Annual salary/)).toBeInTheDocument();
    expect(screen.getByText('Annual salary (choose a country)')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Country'), 'IN');
    expect(screen.getByText('Annual salary (INR)')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Country'), 'JP');
    expect(screen.getByText('Annual salary (JPY)')).toBeInTheDocument();
  });

  it('reports every missing required field', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<EmployeeForm reference={reference} onSubmit={onSubmit} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create employee' }));
    expect(await screen.findByText('Name must be at least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('Choose a job title')).toBeInTheDocument();
    expect(screen.getByText('Choose a country')).toBeInTheDocument();
    expect(screen.getByText('Salary is required')).toBeInTheDocument();
    expect(screen.getByText('Choose an employment type')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid date')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects decimals the currency does not have', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EmployeeForm reference={reference} onSubmit={vi.fn()} />);
    await fillNewHire(user, '8500000.5');
    await user.click(screen.getByRole('button', { name: 'Create employee' }));
    expect(
      await screen.findByText('Amount must not have decimal places for this currency'),
    ).toBeInTheDocument();
  });

  it('submits the salary in minor units with a lower-cased email', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<EmployeeForm reference={reference} onSubmit={onSubmit} />);
    await fillNewHire(user, '1250000.50', 'IN');
    await user.click(screen.getByRole('button', { name: 'Create employee' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        fullName: 'Chika Tanaka',
        email: 'chika@acme.test',
        jobTitleId: 1,
        countryCode: 'IN',
        salaryMinor: 125_000_050,
        employmentType: 'full_time',
        hireDate: '2022-01-10',
      }),
    );
  });

  it('shows server field errors next to the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'An employee with this email already exists', {
        formErrors: [],
        fieldErrors: { email: ['An employee with this email already exists'] },
      }),
    );
    renderWithProviders(<EmployeeForm reference={reference} onSubmit={onSubmit} />);
    await fillNewHire(user, '8500000');
    await user.click(screen.getByRole('button', { name: 'Create employee' }));
    expect(
      await screen.findByText('An employee with this email already exists'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('EmployeeForm (edit)', () => {
  it('warns that the currency changes and requires a new salary when the country changes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<EmployeeForm reference={reference} employee={asha} onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/Annual salary/)).toHaveValue('2500000.00');
    await user.selectOptions(screen.getByLabelText('Country'), 'JP');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Currency will change — enter the salary in JPY',
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Changing the country changes the currency: enter the salary in JPY'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks for an effective date and reason only when the salary changes, and sends only changes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<EmployeeForm reference={reference} employee={asha} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText('Effective date')).not.toBeInTheDocument();

    const salary = screen.getByLabelText(/Annual salary/);
    await user.clear(salary);
    await user.type(salary, '2750000');
    await user.type(screen.getByLabelText('Effective date'), '2026-07-01');
    await user.type(screen.getByLabelText('Reason'), 'Promotion');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        salaryMinor: 275_000_000,
        salaryChange: { effectiveDate: '2026-07-01', reason: 'Promotion' },
      }),
    );
  });
});
