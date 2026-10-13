import type { Metadata } from 'next';
import { ImportWizard } from '@/features/import/components/import-wizard';

export const metadata: Metadata = { title: 'Import · ACME Salary Management' };

export default function ImportPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Import employees</h1>
      <ImportWizard />
    </div>
  );
}
