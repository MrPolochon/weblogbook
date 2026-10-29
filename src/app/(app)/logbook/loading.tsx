import { SkeletonTable } from '@/components/Skeleton';

export default function LogbookLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Chargement du carnet de vol">
      <div className="h-36 animate-pulse rounded-xl border border-slate-700 bg-slate-900" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 rounded-2xl animate-pulse bg-slate-800/40" />
        ))}
      </div>
      <div className="card border-slate-700/40">
        <div className="h-5 w-1/4 rounded animate-pulse bg-slate-700/50 mb-4" />
        <SkeletonTable rows={6} />
      </div>
    </div>
  );
}
