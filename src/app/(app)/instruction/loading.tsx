import { SkeletonTable, SkeletonCard } from '@/components/Skeleton';

export default function InstructionLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div className="h-44 animate-pulse bg-gradient-to-br from-sky-500/10 to-slate-950/95 rounded-2xl" />
      <div className="flex gap-1.5 p-1 rounded-xl bg-slate-800/40 border border-slate-800/60">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex-1 h-10 rounded-lg animate-pulse bg-slate-700/40" />
        ))}
      </div>
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
        <div className="card border-slate-700/40">
          <div className="h-5 w-1/3 rounded animate-pulse bg-slate-700/50 mb-4" />
          <SkeletonTable rows={5} />
        </div>
      </div>
    </div>
  );
}
