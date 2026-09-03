import type { LucideIcon } from 'lucide-react';

export function IfsaEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="py-12 px-4 text-center animate-fade-in">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-slate-800/60 border border-slate-700/60 mb-4 animate-float">
        <Icon className="h-8 w-8 text-slate-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-300">{title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-sm mx-auto">{description}</p>
    </div>
  );
}
