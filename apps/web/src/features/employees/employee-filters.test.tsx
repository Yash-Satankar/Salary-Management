import type { ReferenceData } from '@acme/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type OnUrlUpdateFunction, withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { EmployeeFilters } from './components/employee-filters';
import { toListQuery } from './list-params';

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

function renderFilters(searchParams: string) {
  const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
  renderWithProviders(<EmployeeFilters reference={reference} />, {
    wrapper: withNuqsTestingAdapter({ searchParams, onUrlUpdate }),
  });
  const lastUrl = () => onUrlUpdate.mock.calls.at(-1)?.[0].queryString ?? '';
  return { onUrlUpdate, lastUrl };
}

describe('EmployeeFilters', () => {
  it('shows the filters that are in the URL', () => {
    renderFilters('?search=rao&country=JP&status=all');
    expect(screen.getByLabelText('Search')).toHaveValue('rao');
    expect(screen.getByLabelText('Country')).toHaveValue('JP');
    expect(screen.getByLabelText('Status')).toHaveValue('all');
  });

  it('writes a chosen filter to the URL and returns to the first page', async () => {
    const { lastUrl } = renderFilters('?page=4');
    await userEvent.setup().selectOptions(screen.getByLabelText('Country'), 'JP');
    await waitFor(() => expect(lastUrl()).toBe('?country=JP'));
  });

  it('debounces the search before updating the URL', async () => {
    const { onUrlUpdate, lastUrl } = renderFilters('');
    await userEvent.setup().type(screen.getByLabelText('Search'), 'tanaka');
    expect(onUrlUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(lastUrl()).toBe('?search=tanaka'), { timeout: 2000 });
    expect(onUrlUpdate).toHaveBeenCalledTimes(1);
  });

  it('limits job titles to the chosen department', async () => {
    renderFilters('?departmentId=2');
    const titles = screen.getByLabelText('Job title');
    expect(titles).toHaveTextContent('Recruiter');
    expect(titles).not.toHaveTextContent('Software Engineer');
  });

  it('clears every filter', async () => {
    const { lastUrl } = renderFilters('?search=rao&country=JP&employmentType=contract&page=3');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(lastUrl()).toBe(''));
  });
});

describe('toListQuery', () => {
  it('maps URL state to the API query, dropping empty filters', () => {
    expect(
      toListQuery({
        page: 2,
        pageSize: 50,
        search: '',
        country: 'JP',
        departmentId: null,
        jobTitleId: 7,
        employmentType: null,
        status: 'active',
        sort: 'salaryUsd',
        order: 'desc',
      }),
    ).toEqual({
      page: 2,
      pageSize: 50,
      country: 'JP',
      jobTitleId: 7,
      status: 'active',
      sort: 'salaryUsd',
      order: 'desc',
    });
  });
});
