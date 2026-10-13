import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmployeeDetailView } from '@/features/employees/components/employee-detail';

export const metadata: Metadata = { title: 'Employee · ACME Salary Management' };

export default async function EmployeePage({ params }: PageProps<'/employees/[id]'>) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    notFound();
  }
  return <EmployeeDetailView id={id} />;
}
