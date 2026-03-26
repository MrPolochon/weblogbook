import { Building2 } from 'lucide-react';

export default function CompagnieLoading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-2 border-slate-700/50 border-t-emerald-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Building2 className="h-6 w-6 text-emerald-400" />
        </div>
      </div>
      <p className="text-slate-400 text-sm animate-pulse">Chargement de la compagnie…</p>
    </div>
  );
}
