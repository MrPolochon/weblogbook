import Link from 'next/link';
import { Flame, Wrench } from 'lucide-react';

export default function SiaviMaintenanceNotice() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-red-800 bg-[#1a0b0e] p-8 sm:p-10 shadow-xl">
        <div className="flex justify-center mb-6">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-red-800 bg-[#2a1014]">
            <Wrench className="h-8 w-8 text-amber-400" />
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-lg border border-red-800 bg-[#3a0f18]">
              <Flame className="h-3.5 w-3.5 text-red-400" />
            </span>
          </div>
        </div>
        <p className="text-center text-[11px] font-black uppercase tracking-[0.2em] text-red-400 mb-2">
          Espace SIAVI
        </p>
        <h1 className="text-center text-2xl font-black text-white mb-3">
          En cours de maintenance
        </h1>
        <p className="text-center text-sm text-slate-300 leading-relaxed mb-8">
          Cet espace est temporairement fermé pour maintenance. Seuls les administrateurs peuvent y accéder. Merci de réessayer plus tard.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href="/logbook"
            className="inline-flex items-center justify-center rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-600"
          >
            Retour au logbook
          </Link>
        </div>
      </div>
    </div>
  );
}
