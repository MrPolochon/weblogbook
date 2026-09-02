import { Radio } from 'lucide-react';

export default function AtcLoading() {
  return (
    <div className="h-full min-h-[40vh] flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="h-14 w-14 rounded-full border-2 border-slate-700/50 border-t-emerald-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Radio className="h-5 w-5 text-emerald-400" />
        </div>
      </div>
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Console ATC</p>
    </div>
  );
}
