'use client';

import { BarChart3, LogOut, Upload, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCurrentUser, useLogout } from '@/features/auth/hooks';
import { cn } from '@/lib/utils';

const NAVIGATION = [
  { href: '/employees', label: 'Employees', icon: Users },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/import', label: 'Import', icon: Upload },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const logout = useLogout();

  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.success('Signed out');
        router.replace('/login');
      },
      onError: () => toast.error('Could not sign out. Please try again.'),
    });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-muted/40 md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="px-4 py-4 font-semibold tracking-tight">ACME Salaries</div>
        <nav aria-label="Main" className="flex gap-1 px-2 pb-2 md:flex-col">
          {NAVIGATION.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
                  active && 'bg-accent font-medium',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b px-6 py-3">
          <span className="text-sm text-muted-foreground">{currentUser.data?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut} disabled={logout.isPending}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
