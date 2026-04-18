import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import NavigationProgress from '@/components/NavigationProgress';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'weblogbook',
  description: 'Logbook pilotes – Serveur RP Aviation',
};

export const viewport: Viewport = {
  themeColor: '#0b0e1a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <Toaster
          position="top-center"
          mobileOffset={{ top: '4rem' }}
          offset={{ top: '4.5rem', right: '1rem' }}
          toastOptions={{
            className: '!bg-slate-900/95 !border-slate-600/35 !text-slate-100 !shadow-2xl backdrop-blur-xl',
            duration: 4000,
          }}
          richColors
          closeButton
        />
        {children}
      </body>
    </html>
  );
}
