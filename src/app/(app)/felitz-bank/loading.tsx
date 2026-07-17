import { SkeletonTable } from '@/components/Skeleton';

export default function FelitzBankLoading() {
  return (
    <div className="space-y-6">
      <div className="h-40 animate-pulse bg-gradient-to-br from-emerald-500/10 to-slate-950/95 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-700/40 bg-slate-900/60 overflow-hidden">
            <div className="h-14 animate-pulse bg-slate-800/60" />
            <div className="p-5">
              <div className="h-16 rounded-xl animate-pulse bg-slate-800/40 mb-4" />
              <SkeletonTable rows={4} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
