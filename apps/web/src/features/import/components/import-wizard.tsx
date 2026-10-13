'use client';

import type { ImportResult } from '@acme/shared';
import { CheckCircle2, Download, FileUp } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api-client';
import { useApplyImport, useImportPreview } from '../api';

const number = new Intl.NumberFormat('en-US');

function problemMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'The file could not be checked. Please try again.';
}

export function ImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const preview = useImportPreview();
  const apply = useApplyImport();

  const chooseFile = (chosen: File | null) => {
    setFile(chosen);
    preview.reset();
    apply.reset();
  };

  const check = (event: FormEvent) => {
    event.preventDefault();
    if (file) {
      apply.reset();
      preview.mutate(file);
    }
  };

  const applyImport = () => {
    if (!file) return;
    apply.mutate(file, {
      onSuccess: (result) =>
        toast.success(`Imported ${result.toCreate + result.toUpdate} changes from ${file.name}`),
    });
  };

  const plan = preview.data;
  const canApply = plan !== undefined && plan.errors.length === 0 && !apply.isSuccess;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose a CSV file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Rows without an <code>employee_code</code> create employees; rows with one update that
            employee. The file is checked first and applied all-or-nothing, so a file with any error
            never changes data. An exported file can be edited in Excel and imported back.
          </p>
          <form onSubmit={check} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="import-file">CSV file</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <Button type="submit" disabled={!file || preview.isPending}>
              <FileUp className="size-4" aria-hidden />
              {preview.isPending ? 'Checking…' : 'Check file'}
            </Button>
            <Button asChild variant="link">
              <a href="/employee-import-template.csv" download>
                <Download className="size-4" aria-hidden />
                Download template
              </a>
            </Button>
          </form>
          {preview.isError && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive">
              {problemMessage(preview.error)}
            </p>
          )}
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>2. Review and apply</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PlanSummary plan={plan} />
            {plan.errors.length > 0 ? (
              <>
                <p className="text-sm text-destructive">
                  {number.format(plan.errors.length)} problem(s) found. Nothing will be written
                  until every row is fixed.
                </p>
                <ErrorTable errors={plan.errors} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No problems found.</p>
            )}
            <Button onClick={applyImport} disabled={!canApply || apply.isPending}>
              {apply.isPending ? 'Applying…' : 'Apply import'}
            </Button>
            {apply.isError && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {problemMessage(apply.error)}
              </p>
            )}
            {apply.data && <AppliedMessage result={apply.data} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlanSummary({ plan }: { plan: ImportResult }) {
  const stats = [
    ['Rows', plan.totalRows],
    ['To create', plan.toCreate],
    ['To update', plan.toUpdate],
    ['Unchanged', plan.unchanged],
    ['Errors', plan.errors.length],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-lg border p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-xl font-semibold tabular-nums">{number.format(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ErrorTable({ errors }: { errors: ImportResult['errors'] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-lg border">
      <Table aria-label="Import errors">
        <TableCaption className="sr-only">Rows that must be fixed before importing</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Row</TableHead>
            <TableHead className="w-40">Field</TableHead>
            <TableHead>Problem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {errors.map((error, index) => (
            <TableRow key={`${error.row}-${error.field}-${index}`}>
              <TableCell className="tabular-nums">{error.row}</TableCell>
              <TableCell>{error.field}</TableCell>
              <TableCell>{error.message}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AppliedMessage({ result }: { result: ImportResult }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"
    >
      <CheckCircle2 className="size-4" aria-hidden />
      Import applied: {number.format(result.toCreate)} created, {number.format(result.toUpdate)}{' '}
      updated, {number.format(result.unchanged)} unchanged.
    </p>
  );
}
