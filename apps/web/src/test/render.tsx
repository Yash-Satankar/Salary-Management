import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { JSXElementConstructor, ReactElement, ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Renders with a fresh, non-retrying query client so each test is isolated. A `wrapper` passed in
 * options (e.g. the nuqs testing adapter) is nested inside the providers rather than replacing them.
 */
export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  const { wrapper: Inner, ...rest } = options;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const InnerWrapper: JSXElementConstructor<{ children: ReactNode }> =
    Inner ?? (({ children }) => children);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <InnerWrapper>{children}</InnerWrapper>
      </TooltipProvider>
    </QueryClientProvider>
  );
  return { queryClient, ...render(ui, { wrapper, ...rest }) };
}
