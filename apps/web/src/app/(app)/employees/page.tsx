import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingRows } from '@/components/query-states';
import { EmployeeList } from '@/features/employees/components/employee-list';

export const metadata: Metadata = { title: 'Employees · ACME Salary Management' };

export default function EmployeesPage() {
  // Filters live in the URL; Suspense lets the page prerender before search params are known.
  return (
    <Suspense fallback={<LoadingRows label="Loading employees" />}>
      <EmployeeList />
    </Suspense>
  );
}
