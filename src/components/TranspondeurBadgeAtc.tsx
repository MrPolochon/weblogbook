'use client';

import { AlertTriangle } from 'lucide-react';

// Codes d'urgence
const EMERGENCY_CODES: Record<string, { label: string; short: string }> = {
  '7500': { label: 'DÉTOURNEMENT', short: 'HIJ' },
  '7600': { label: 'PANNE RADIO', short: 'COM' },
  '7700': { label: 'URGENCE', short: 'EMG' },
};

interface TranspondeurBadgeAtcProps {
  code: string | null;
  mode: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function TranspondeurBadgeAtc({ code, mode, size = 'md' }: TranspondeurBadgeAtcProps) {
  if (!code) {
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded font-mono ${
        size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'
      } bg-slate-200 text-slate-500 border border-slate-300`}>
        <span>{mode}</span>
        <span className="text-slate-400">|</span>
        <span className="text-slate-400">----</span>
      </div>
    );
  }

  const emergencyInfo = EMERGENCY_CODES[code];
  const isEmergency = !!emergencyInfo;

  if (isEmergency) {
    return (
      <div className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-mono font-bold ${
        size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm'
      } bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/50`}>
        <AlertTriangle className={`${size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'}`} />
        <span>{mode}</span>
        <span className="opacity-60">|</span>
        <span>{code}</span>
        <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
          {emergencyInfo.short}
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded font-mono font-semibold ${
      size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'
    } bg-emerald-100 text-emerald-700 border-2 border-emerald-400`}>
      <span className="text-emerald-600">{mode}</span>
      <span className="text-emerald-400">|</span>
      <span>{code}</span>
    </div>
  );
}
