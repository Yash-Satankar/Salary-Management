import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingRows } from '@/components/query-states';
import { InsightsDashboard } from '@/features/insights/components/insights-dashboard';

export const metadata: Metadata = { title: 'Insights · ACME Salary Management' };

export default function InsightsPage() {
  return (
    <Suspense fallback={<LoadingRows label="Loading insights" />}>
      <InsightsDashboard />
    </Suspense>
  );
}
