'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Flame, Radio, FileText, Mail, LogOut, Clock, Plane, MapPin, User, LayoutDashboard } from 'lucide-react';
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

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const links = [
    { href: '/siavi', label: 'Centre', icon: Flame },
    { href: '/siavi/documents', label: 'Documents', icon: FileText },
    { href: '/siavi/compte', label: 'Compte', icon: User },
  ];
  
  const adminLinks = isAdmin ? [
    { href: '/siavi/admin', label: 'Admin', icon: LayoutDashboard },
  ] : [];

  return (
    <nav className="bg-gradient-to-r from-red-800 to-red-700 border-b border-red-600 shadow-lg">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo et titre */}
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-white/10">
              <Flame className="h-6 w-6 text-white" />
            </div>
            <div>
              <span className="font-bold text-white text-lg">SIAVI</span>
              <span className="text-red-200 text-xs ml-2 hidden sm:inline">Brigade AFIS</span>
            </div>
          </div>

          {/* Status service */}
          {enService && sessionInfo && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10">
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
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-red-100 hover:bg-white/10 hover:text-white'
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
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-red-100 hover:bg-white/10 hover:text-white'
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-100 hover:bg-emerald-500/20 hover:text-emerald-200 transition-all"
                  title="Espace ATC"
                >
                  <Radio className="h-4 w-4" />
                  <span className="hidden sm:inline">ATC</span>
                </Link>
                <Link
                  href="/logbook"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-100 hover:bg-sky-500/20 hover:text-sky-200 transition-all"
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-100 hover:bg-white/10 hover:text-white transition-all"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
