'use client';

import { EMPLOYMENT_TYPES, type ReferenceData, STATUS_FILTERS } from '@acme/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useEmployeeListParams } from '../list-params';
import { EMPLOYMENT_TYPE_LABELS, STATUS_LABELS } from '../labels';

const SEARCH_DEBOUNCE_MS = 300;

export function EmployeeFilters({ reference }: { reference: ReferenceData }) {
  const [params, setParams] = useEmployeeListParams();

  // The input updates instantly while the URL (and the query) waits for typing to pause.
  const [draftSearch, setDraftSearch] = useState(params.search);
  const [syncedSearch, setSyncedSearch] = useState(params.search);
  if (params.search !== syncedSearch) {
    setSyncedSearch(params.search);
    setDraftSearch(params.search);
  }
  useEffect(() => {
    if (draftSearch === params.search) {
      return;
    }
    const timer = setTimeout(
      () => void setParams({ search: draftSearch, page: null }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [draftSearch, params.search, setParams]);

  const titles = reference.jobTitles.filter(
    (title) => params.departmentId === null || title.departmentId === params.departmentId,
  );

  const changeDepartment = (value: string) => {
    const departmentId = value ? Number(value) : null;
    const keepTitle = reference.jobTitles.some(
      (title) => title.id === params.jobTitleId && title.departmentId === departmentId,
    );
    void setParams({ departmentId, jobTitleId: keepTitle ? params.jobTitleId : null, page: null });
  };

  const clearFilters = () => {
    setDraftSearch('');
    void setParams({
      search: null,
      country: null,
      departmentId: null,
      jobTitleId: null,
      employmentType: null,
      status: null,
      page: null,
    });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(5,1fr)_auto] lg:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="filter-search">Search</Label>
        <Input
          id="filter-search"
          type="search"
          placeholder="Name, email or employee code"
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
        />
      </div>
      <FilterSelect
        id="filter-country"
        label="Country"
        value={params.country}
        onChange={(value) => void setParams({ country: value || null, page: null })}
        options={reference.countries.map((country) => [country.code, country.name])}
        allLabel="All countries"
      />
      <FilterSelect
        id="filter-department"
        label="Department"
        value={params.departmentId === null ? '' : String(params.departmentId)}
        onChange={changeDepartment}
        options={reference.departments.map((department) => [
          String(department.id),
          department.name,
        ])}
        allLabel="All departments"
      />
      <FilterSelect
        id="filter-job-title"
        label="Job title"
        value={params.jobTitleId === null ? '' : String(params.jobTitleId)}
        onChange={(value) =>
          void setParams({ jobTitleId: value ? Number(value) : null, page: null })
        }
        options={titles.map((title) => [String(title.id), title.name])}
        allLabel="All job titles"
      />
      <FilterSelect
        id="filter-employment-type"
        label="Type"
        value={params.employmentType ?? ''}
        onChange={(value) =>
          void setParams({
            employmentType: EMPLOYMENT_TYPES.find((type) => type === value) ?? null,
            page: null,
          })
        }
        options={EMPLOYMENT_TYPES.map((type) => [type, EMPLOYMENT_TYPE_LABELS[type]])}
        allLabel="All types"
      />
      <FilterSelect
        id="filter-status"
        label="Status"
        value={params.status}
        onChange={(value) =>
          void setParams({
            status: STATUS_FILTERS.find((status) => status === value) ?? null,
            page: null,
          })
        }
        options={STATUS_FILTERS.map((status) => [status, STATUS_LABELS[status]])}
      />
      <Button variant="ghost" onClick={clearFilters}>
        Clear filters
      </Button>
    </div>
  );
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [value: string, label: string][];
  /** Adds an empty "no filter" option when present. */
  allLabel?: string;
}

function FilterSelect({ id, label, value, onChange, options, allLabel }: FilterSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        className="w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allLabel !== undefined && <NativeSelectOption value="">{allLabel}</NativeSelectOption>}
        {options.map(([optionValue, optionLabel]) => (
          <NativeSelectOption key={optionValue} value={optionValue}>
            {optionLabel}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
