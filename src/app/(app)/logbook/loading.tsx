import { SkeletonTable } from '@/components/Skeleton';

export default function LogbookLoading() {
  return (
    <div className="space-y-6">
      <div className="h-36 animate-pulse bg-gradient-to-br from-sky-600/20 via-sky-700/15 to-indigo-800/20 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl animate-pulse bg-slate-800/40" />
        ))}
      </div>
      <div className="card border-slate-700/40">
        <div className="h-5 w-1/4 rounded animate-pulse bg-slate-700/50 mb-4" />
        <SkeletonTable rows={6} />
      </div>
    </div>
  );
}
