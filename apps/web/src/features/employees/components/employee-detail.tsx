'use client';

import type { EmployeeDetail, ReferenceData } from '@acme/shared';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { FxDisclaimer } from '@/components/fx-disclaimer';
import { ErrorState, LoadingRows } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { minorUnitOf, useReference } from '@/features/reference/hooks';
import { ApiError } from '@/lib/api-client';
import { formatSalary, formatUsdApprox } from '@/lib/money';
import { useEmployee, useUpdateEmployee } from '../hooks';
import { EMPLOYMENT_TYPE_LABELS, STATUS_LABELS } from '../labels';
import { EmployeeForm } from './employee-form';
import { SalaryHistory } from './salary-history';
import { TerminateDialog } from './terminate-dialog';

export function EmployeeDetailView({ id }: { id: number }) {
  const employee = useEmployee(id);
  const reference = useReference();

  if (employee.error instanceof ApiError && employee.error.status === 404) {
    return <p className="text-sm text-muted-foreground">Employee {id} was not found.</p>;
  }
  if (employee.isError || reference.isError) {
    return (
      <ErrorState
        message="This employee could not be loaded."
        onRetry={() => {
          void employee.refetch();
          void reference.refetch();
        }}
      />
    );
  }
  if (!employee.data || !reference.data) {
    return <LoadingRows rows={6} label="Loading employee" />;
  }
  return (
    <Loaded employee={employee.data.data} reference={reference.data} fx={employee.data.meta.fx} />
  );
}

interface LoadedProps {
  employee: EmployeeDetail;
  reference: ReferenceData;
  fx: { asOf: string; source: string };
}

function Loaded({ employee, reference, fx }: LoadedProps) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateEmployee(employee.id);
  const isActive = employee.status === 'active';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/employees" className="text-sm text-muted-foreground hover:underline">
            ← Employees
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            {employee.fullName}
            <Badge variant={isActive ? 'secondary' : 'outline'}>
              {STATUS_LABELS[employee.status]}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">{employee.employeeCode}</p>
        </div>
        {isActive && !editing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <TerminateDialog id={employee.id} name={employee.fullName} />
          </div>
        )}
      </div>

      {!isActive && (
        <p className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
          <Lock className="size-4" aria-hidden />
          Terminated on {employee.terminatedOn}. Terminated employees are kept for history and are
          read-only.
        </p>
      )}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit employee</CardTitle>
          </CardHeader>
          <CardContent>
            <EmployeeForm
              reference={reference}
              employee={employee}
              onCancel={() => setEditing(false)}
              onSubmit={async (input) => {
                await update.mutateAsync(input);
                toast.success('Changes saved');
                setEditing(false);
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Summary employee={employee} reference={reference} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Salary history</CardTitle>
        </CardHeader>
        <CardContent>
          <SalaryHistory entries={employee.salaryHistory} reference={reference} />
        </CardContent>
      </Card>

      <FxDisclaimer fx={fx} />
    </div>
  );
}

function Summary({ employee, reference }: { employee: EmployeeDetail; reference: ReferenceData }) {
  return (
    <Card>
      <CardContent className="grid gap-x-8 gap-y-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
        <Item label="Annual salary">
          <span className="text-lg font-semibold">
            {formatSalary(employee.salary, minorUnitOf(reference, employee.salary.currency))}
          </span>{' '}
          <span className="text-sm text-muted-foreground">
            {formatUsdApprox(employee.salaryUsd)}
          </span>
        </Item>
        <Item label="Job title">{employee.jobTitle.name}</Item>
        <Item label="Department">{employee.department.name}</Item>
        <Item label="Country">{employee.country.name}</Item>
        <Item label="Employment type">{EMPLOYMENT_TYPE_LABELS[employee.employmentType]}</Item>
        <Item label="Hire date">{employee.hireDate}</Item>
        <Item label="Email">{employee.email}</Item>
      </CardContent>
    </Card>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}
