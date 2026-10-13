'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ErrorState, LoadingRows } from '@/components/query-states';
import { useReference } from '@/features/reference/hooks';
import { useCreateEmployee } from '../hooks';
import { EmployeeForm } from './employee-form';

export function NewEmployee() {
  const router = useRouter();
  const reference = useReference();
  const createEmployee = useCreateEmployee();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/employees" className="text-sm text-muted-foreground hover:underline">
          ← Employees
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Add employee</h1>
      </div>
      {reference.isError ? (
        <ErrorState
          message="Reference data could not be loaded."
          onRetry={() => void reference.refetch()}
        />
      ) : !reference.data ? (
        <LoadingRows rows={6} label="Loading form" />
      ) : (
        <EmployeeForm
          reference={reference.data}
          onCancel={() => router.push('/employees')}
          onSubmit={async (input) => {
            const { data } = await createEmployee.mutateAsync(input);
            toast.success(`${data.fullName} added as ${data.employeeCode}`);
            router.push(`/employees/${data.id}`);
          }}
        />
      )}
    </div>
  );
}
