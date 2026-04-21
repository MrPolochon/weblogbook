'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Flame, Radio, FileText, Mail, LogOut, Clock, Plane, MapPin, User, LayoutDashboard, Landmark, HeartPulse } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface SiaviNavBarProps {
  isAdmin: boolean;
  enService: boolean;
  estAfis: boolean;
  sessionInfo: { aeroport: string; started_at: string } | null;
  messagesNonLusCount: number;
}

export default function SiaviNavBar({ isAdmin, enService, estAfis, sessionInfo, messagesNonLusCount }: SiaviNavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    startTransition(() => router.refresh());
  };

  const links = [
    { href: '/siavi', label: 'Centre', icon: Flame },
    { href: '/siavi/medevac/nouveau', label: 'MEDEVAC', icon: HeartPulse },
    { href: '/siavi/flotte', label: 'Flotte', icon: Plane },
    { href: '/siavi/documents', label: 'Documents', icon: FileText },
    { href: '/siavi/messagerie', label: 'Messagerie', icon: Mail },
    { href: '/siavi/felitz-bank', label: 'Banque', icon: Landmark },
    { href: '/siavi/compte', label: 'Compte', icon: User },
  ];
  
  const adminLinks = isAdmin ? [
    { href: '/siavi/admin', label: 'Admin', icon: LayoutDashboard },
  ] : [];

  return (
    <nav className="border-b border-red-400/30 bg-gradient-to-r from-[#3a0f18]/95 via-[#5a1022]/95 to-[#7a1428]/95 backdrop-blur-2xl shadow-[0_20px_40px_rgba(40,6,16,0.55)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-5 lg:px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Logo et titre */}
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg border border-red-300/25 bg-white/10">
              <Flame className="h-6 w-6 text-white" />
            </div>
            <div>
              <span className="font-bold text-white text-lg">SIAVI</span>
              <span className="text-red-200/90 text-xs ml-2 hidden sm:inline">Brigade AFIS</span>
            </div>
          </div>

          {/* Status service */}
          {enService && sessionInfo && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-red-300/25 bg-white/10">
              <MapPin className="h-4 w-4 text-red-200" />
              <span className="font-mono font-bold text-white">{sessionInfo.aeroport}</span>
              {estAfis ? (
                <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/30 text-green-200 font-medium">AFIS</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/30 text-amber-200 font-medium">Pompier</span>
              )}
              <span className="text-red-300 text-xs flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(sessionInfo.started_at), { locale: fr })}
              </span>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || (href !== '/siavi' && pathname?.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
                    isActive
                      ? 'border-red-200/35 bg-white/20 text-white'
                      : 'border-transparent text-red-100 hover:border-red-200/25 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
            
            {/* Liens admin */}
            {adminLinks.map(({ href, label, icon: Icon }) => {
              const isActive = pathname?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
                    isActive
                      ? 'border-red-200/35 bg-white/20 text-white'
                      : 'border-transparent text-red-100 hover:border-red-200/25 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}

            {/* Boutons switch admin */}
            {isAdmin && (
              <>
                <Link
                  href="/atc"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-transparent text-sm font-semibold text-red-100 hover:border-emerald-300/30 hover:bg-emerald-500/20 hover:text-emerald-200 transition-all"
                  title="Espace ATC"
                >
                  <Radio className="h-4 w-4" />
                  <span className="hidden sm:inline">ATC</span>
                </Link>
                <Link
                  href="/logbook"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-transparent text-sm font-semibold text-red-100 hover:border-sky-300/30 hover:bg-sky-500/20 hover:text-sky-200 transition-all"
                  title="Espace pilote"
                >
                  <Plane className="h-4 w-4" />
                  <span className="hidden sm:inline">Pilote</span>
                </Link>
              </>
            )}

            {/* Déconnexion */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-transparent text-sm font-semibold text-red-100 hover:border-red-200/25 hover:bg-white/10 hover:text-white transition-all"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
