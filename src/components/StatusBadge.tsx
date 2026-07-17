import { cn } from '@/lib/utils';

export interface StatusBadgeConfig {
  label: string;
  className: string;
  icon?: React.ReactNode;
}

interface StatusBadgeProps {
  status: string;
  map: Record<string, StatusBadgeConfig>;
  fallback?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, map, fallback = status, size = 'sm', className }: StatusBadgeProps) {
  const config = map[status];
  const sizeClass = size === 'md' ? 'px-3 py-1 text-sm gap-1.5' : 'px-2 py-0.5 text-xs gap-1';
  if (!config) {
    return (
      <span className={cn('inline-flex items-center rounded-full font-medium bg-slate-700 text-slate-300', sizeClass, className)}>
        {fallback}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center rounded-full font-medium', sizeClass, config.className, className)}>
      {config.icon}
      {config.label}
    </span>
  );
}
