import { Radio } from 'lucide-react';

export default function AtcLoading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-2 border-slate-700/50 border-t-sky-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Radio className="h-6 w-6 text-sky-400" />
        </div>
      </div>
      <p className="text-slate-400 text-sm animate-pulse">Chargement ATC…</p>
    </div>
  );
}
