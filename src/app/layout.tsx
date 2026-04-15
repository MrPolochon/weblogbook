import type { Metadata } from 'next';
import { Suspense } from 'react';
import NavigationProgress from '@/components/NavigationProgress';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'weblogbook',
  description: 'Logbook pilotes – Serveur RP Aviation',
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
          position="top-right"
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
