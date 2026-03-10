import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import NavigationProgress from '@/components/NavigationProgress';
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
            className: '!bg-slate-800 !border-slate-700/50 !text-slate-100 !shadow-xl',
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
