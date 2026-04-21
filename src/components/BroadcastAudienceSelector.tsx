'use client';

import { Plane, Radio, HeartPulse, ShieldAlert, ShieldCheck, Globe2 } from 'lucide-react';

export const BROADCAST_AUDIENCES = ['pilotes', 'atc', 'siavi', 'ifsa', 'admins', 'all'] as const;
export type BroadcastAudience = typeof BROADCAST_AUDIENCES[number];

const OPTIONS: Array<{
  id: BroadcastAudience;
  label: string;
  hint: string;
  icon: typeof Plane;
  color: string;
}> = [
  { id: 'all', label: 'Tout le monde', hint: 'Tous les utilisateurs', icon: Globe2, color: 'text-violet-300 border-violet-500/40 bg-violet-500/10 hover:border-violet-500' },
  { id: 'pilotes', label: 'Pilotes', hint: 'Tous les pilotes', icon: Plane, color: 'text-sky-300 border-sky-500/40 bg-sky-500/10 hover:border-sky-500' },
  { id: 'atc', label: 'ATC', hint: 'Contrôleurs aériens', icon: Radio, color: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10 hover:border-emerald-500' },
  { id: 'siavi', label: 'SIAVI', hint: 'Agents de brigade', icon: HeartPulse, color: 'text-red-300 border-red-500/40 bg-red-500/10 hover:border-red-500' },
  { id: 'ifsa', label: 'IFSA', hint: 'Inspecteurs IFSA', icon: ShieldAlert, color: 'text-amber-300 border-amber-500/40 bg-amber-500/10 hover:border-amber-500' },
  { id: 'admins', label: 'Admins', hint: 'Administrateurs', icon: ShieldCheck, color: 'text-indigo-300 border-indigo-500/40 bg-indigo-500/10 hover:border-indigo-500' },
];

interface Props {
  value: BroadcastAudience | null;
  onChange: (a: BroadcastAudience | null) => void;
  compact?: boolean;
}

export default function BroadcastAudienceSelector({ value, onChange, compact = false }: Props) {
  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
      {OPTIONS.map(opt => {
        const Icon = opt.icon;
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(selected ? null : opt.id)}
            className={`group flex flex-col items-start gap-1 rounded-lg border-2 p-2.5 text-left transition-all ${
              selected
                ? `${opt.color.split(' ').filter(c => c.startsWith('border-') || c.startsWith('bg-') || c.startsWith('text-')).map(c => c.replace('/40', '').replace('/10', '/20')).join(' ')} ring-2 ring-offset-1 ring-offset-slate-900`
                : `${opt.color} border-opacity-30`
            }`}
          >
            <div className="flex items-center gap-2 w-full">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold">{opt.label}</span>
            </div>
            {!compact && (
              <span className="text-[10px] text-slate-400 leading-tight">{opt.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function audienceLabel(audience: BroadcastAudience): string {
  const opt = OPTIONS.find(o => o.id === audience);
  return opt?.label || audience;
}
