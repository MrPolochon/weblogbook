'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, History } from 'lucide-react';

type Props = {
  openCount: number;
  closedCount: number;
  childrenOpen: ReactNode;
  childrenHistory: ReactNode;
};

export default function AdminPlansVolTabs({ openCount, closedCount, childrenOpen, childrenHistory }: Props) {
  const [tab, setTab] = useState<'open' | 'history'>('open');

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1">
        <button
          onClick={() => setTab('open')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            tab === 'open'
              ? 'bg-slate-700 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Non clôturés
          {openCount > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              tab === 'open' ? 'bg-red-500 text-white' : 'bg-red-500/20 text-red-400'
            }`}>
              {openCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            tab === 'history'
              ? 'bg-slate-700 text-slate-100 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
          }`}
        >
          <History className="h-4 w-4" />
          Historique
          {closedCount > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              tab === 'history' ? 'bg-violet-500 text-white font-bold' : 'bg-violet-500/20 text-violet-400'
            }`}>
              {closedCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {tab === 'open' ? childrenOpen : childrenHistory}
    </div>
  );
}
