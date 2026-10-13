'use client';

import { Download, Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { FxDisclaimer } from '@/components/fx-disclaimer';
import { EmptyState, ErrorState, LoadingRows } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { useReference } from '@/features/reference/hooks';
import { exportUrl } from '../api';
import { useEmployees } from '../hooks';
import { toListQuery, useEmployeeListParams } from '../list-params';
import { EmployeeFilters } from './employee-filters';
import { EmployeesTable } from './employees-table';
import { Pagination } from './pagination';

export function EmployeeList() {
  const [params] = useEmployeeListParams();
  const query = toListQuery(params);
  const reference = useReference();
  const employees = useEmployees(query);
  const { page: _page, pageSize: _pageSize, ...exportFilters } = query;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={exportUrl(exportFilters)} download>
              <Download className="size-4" aria-hidden />
              Export CSV
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href="/import">
              <Upload className="size-4" aria-hidden />
              Import
            </Link>
          </Button>
          <Button asChild>
            <Link href="/employees/new">
              <Plus className="size-4" aria-hidden />
              Add employee
            </Link>
          </Button>
        </div>
      </div>

      {reference.data && <EmployeeFilters reference={reference.data} />}

      {employees.isError || reference.isError ? (
        <ErrorState
          message="The employee list could not be loaded."
          onRetry={() => {
            void reference.refetch();
            void employees.refetch();
          }}
        />
      ) : !employees.data || !reference.data ? (
        <LoadingRows label="Loading employees" />
      ) : employees.data.data.length === 0 ? (
        <EmptyState>No employees match these filters.</EmptyState>
      ) : (
        <>
          <EmployeesTable
            items={employees.data.data}
            reference={reference.data}
            fx={employees.data.meta.fx}
          />
          <Pagination meta={employees.data.meta} />
          <FxDisclaimer fx={employees.data.meta.fx} />
        </>
      )}
    </div>
  );
}
