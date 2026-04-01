import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import NavigationProgress from '@/components/NavigationProgress';
import EasterThemeController from '@/components/EasterThemeController';
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
        <EasterThemeController />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <Toaster
          position="top-right"
          toastOptions={{
            className: '!bg-violet-950/90 !border-fuchsia-300/30 !text-fuchsia-50 !shadow-2xl backdrop-blur-xl',
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
