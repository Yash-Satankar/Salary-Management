import type { Metadata } from 'next';
import { NewEmployee } from '@/features/employees/components/new-employee';

export const metadata: Metadata = { title: 'Add employee · ACME Salary Management' };

export default function NewEmployeePage() {
  return <NewEmployee />;
}
