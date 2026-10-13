'use client';

import type { EmployeeListItem, EmployeeSortField, FxMeta, ReferenceData } from '@acme/shared';
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSalary, formatUsdApprox } from '@/lib/money';
import { minorUnitOf } from '@/features/reference/hooks';
import { cn } from '@/lib/utils';
import { EMPLOYMENT_TYPE_LABELS, STATUS_LABELS } from '../labels';
import { useEmployeeListParams } from '../list-params';

// Sorting and pagination are server-side (manual), so only the core table features are needed.
const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, EmployeeListItem>();

function SortHeader({ field, label }: { field: EmployeeSortField; label: string }) {
  const [params, setParams] = useEmployeeListParams();
  const active = params.sort === field;
  const nextOrder = active && params.order === 'asc' ? 'desc' : 'asc';
  const Icon = !active ? ArrowUpDown : params.order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground"
      aria-label={`Sort by ${label}`}
      onClick={() => void setParams({ sort: field, order: nextOrder, page: null })}
    >
      {label}
      <Icon className={cn('size-3.5', !active && 'opacity-40')} aria-hidden />
    </button>
  );
}

interface EmployeesTableProps {
  items: EmployeeListItem[];
  reference: ReferenceData;
  fx: FxMeta;
}

export function EmployeesTable({ items, reference, fx }: EmployeesTableProps) {
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('employeeCode', { header: 'Code' }),
        columnHelper.accessor('fullName', {
          header: () => <SortHeader field="fullName" label="Name" />,
          cell: (info) => (
            <Link
              href={`/employees/${info.row.original.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {info.getValue()}
            </Link>
          ),
        }),
        columnHelper.accessor((row) => row.jobTitle.name, {
          id: 'jobTitle',
          header: () => <SortHeader field="jobTitle" label="Job title" />,
        }),
        columnHelper.accessor((row) => row.department.name, {
          id: 'department',
          header: 'Department',
        }),
        columnHelper.accessor((row) => row.country.name, {
          id: 'country',
          header: () => <SortHeader field="country" label="Country" />,
        }),
        columnHelper.accessor('salary', {
          header: 'Salary',
          cell: (info) => {
            const salary = info.getValue();
            return formatSalary(salary, minorUnitOf(reference, salary.currency));
          },
        }),
        columnHelper.accessor('salaryUsd', {
          header: () => <SortHeader field="salaryUsd" label="≈ USD" />,
          cell: (info) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-muted-foreground">
                  {formatUsdApprox(info.getValue())}
                </span>
              </TooltipTrigger>
              <TooltipContent>Approximate, at static rates as of {fx.asOf}</TooltipContent>
            </Tooltip>
          ),
        }),
        columnHelper.accessor('employmentType', {
          header: 'Type',
          cell: (info) => EMPLOYMENT_TYPE_LABELS[info.getValue()],
        }),
        columnHelper.accessor('hireDate', {
          header: () => <SortHeader field="hireDate" label="Hire date" />,
        }),
        columnHelper.accessor('status', {
          header: 'Status',
          cell: (info) => (
            <Badge variant={info.getValue() === 'active' ? 'secondary' : 'outline'}>
              {STATUS_LABELS[info.getValue()]}
            </Badge>
          ),
        }),
      ]),
    [reference, fx.asOf],
  );

  const table = useTable({ features, columns, data: items });

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="whitespace-nowrap">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className="whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
