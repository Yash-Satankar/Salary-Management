import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = { title: 'Sign in · ACME Salary Management' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">ACME Salary Management</CardTitle>
          <CardDescription>
            Sign in with your HR account. Salary data is confidential.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* useSearchParams (for ?next=) needs a Suspense boundary when the page is prerendered. */}
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
