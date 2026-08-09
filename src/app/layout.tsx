import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Certus',
  description: 'Policy-gated intent settlement for verified finance',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('certus-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch{}` }} /></head>
      <body>{children}</body>
    </html>
  );
}
