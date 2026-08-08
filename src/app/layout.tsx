import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Certus',
  description: 'Policy-gated intent settlement for verified finance',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
