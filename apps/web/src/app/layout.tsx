import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ACME Salary Management',
  description: 'Maintain and analyse ACME salary data',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
