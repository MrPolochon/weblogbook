import { Mail } from 'lucide-react';

export default function MessagerieLoading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-2 border-slate-700/50 border-t-violet-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Mail className="h-6 w-6 text-violet-400" />
        </div>
      </div>
      <p className="text-slate-400 text-sm animate-pulse">Chargement de la messagerie…</p>
    </div>
  );
}
