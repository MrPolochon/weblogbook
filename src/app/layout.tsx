import type { Metadata } from 'next';
import { Suspense } from 'react';
import NavigationProgress from '@/components/NavigationProgress';
import EasterThemeController from '@/components/EasterThemeController';
import ThemedToaster from '@/components/ThemedToaster';
import AprilFoolVictimsTicker from '@/components/AprilFoolVictimsTicker';
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
        <ThemedToaster />
        <AprilFoolVictimsTicker />
        {children}
      </body>
    </html>
  );
}
