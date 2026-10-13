'use client';

import type { EmployeeListMeta } from '@acme/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useEmployeeListParams } from '../list-params';

const PAGE_SIZES = [10, 25, 50, 100];
const number = new Intl.NumberFormat('en-US');

export function Pagination({ meta }: { meta: EmployeeListMeta }) {
  const [, setParams] = useEmployeeListParams();
  const first = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Showing {number.format(first)}–{number.format(last)} of {number.format(meta.total)}
      </p>
      <div className="flex items-center gap-2">
        <Label htmlFor="page-size" className="text-muted-foreground">
          Rows per page
        </Label>
        <NativeSelect
          id="page-size"
          size="sm"
          value={String(meta.pageSize)}
          onChange={(event) => void setParams({ pageSize: Number(event.target.value), page: null })}
        >
          {PAGE_SIZES.map((size) => (
            <NativeSelectOption key={size} value={size}>
              {size}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => void setParams({ page: meta.page - 1 })}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </Button>
        <span className="tabular-nums">
          Page {meta.page} of {Math.max(meta.totalPages, 1)}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page >= meta.totalPages}
          onClick={() => void setParams({ page: meta.page + 1 })}
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
