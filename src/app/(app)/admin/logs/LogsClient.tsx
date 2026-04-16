'use client';

import { useState, useMemo } from 'react';
import { ArrowLeft, Search, Filter, Clock, User, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

interface LogEntry {
  id: string;
  user_id: string | null;
  user_identifiant: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

interface Props {
  logs: LogEntry[];
  actionTypes: string[];
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  update: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  delete: 'bg-red-500/15 text-red-400 border-red-500/30',
  login: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  approve: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  reject: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  send: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

function getActionColor(action: string): string {
  const lower = action.toLowerCase();
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (lower.includes(key)) return cls;
  }
  return 'bg-slate-700/50 text-slate-300 border-slate-600/30';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${day}/${month} ${h}:${m}:${s}`;
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'à l\'instant';
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffMs / 86_400_000);
  return `${diffD}j`;
}

export default function LogsClient({ logs, actionTypes }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);

  const targetTypes = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) if (l.target_type) set.add(l.target_type);
    return [...set].sort();
  }, [logs]);

  const filtered = useMemo(() => {
    let result = logs;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        (l.user_identifiant || '').toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.target_id || '').toLowerCase().includes(q) ||
        (l.ip || '').includes(q) ||
        JSON.stringify(l.details || {}).toLowerCase().includes(q)
      );
    }
    if (actionFilter) result = result.filter(l => l.action === actionFilter);
    if (targetFilter) result = result.filter(l => l.target_type === targetFilter);
    return result.slice(0, limit);
  }, [logs, searchQuery, actionFilter, targetFilter, limit]);

  const totalFiltered = useMemo(() => {
    let result = logs;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        (l.user_identifiant || '').toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.target_id || '').toLowerCase().includes(q)
      );
    }
    if (actionFilter) result = result.filter(l => l.action === actionFilter);
    if (targetFilter) result = result.filter(l => l.target_type === targetFilter);
    return result.length;
  }, [logs, searchQuery, actionFilter, targetFilter]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin" className="p-2 rounded-lg hover:bg-slate-800/60 transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-100">Journal d&apos;activité</h1>
          <p className="text-sm text-slate-500">{logs.length} entrées chargées — {totalFiltered} affichées</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher (utilisateur, action, IP, détails...)"
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-200 text-sm placeholder:text-slate-600 focus:border-sky-500/40 focus:outline-none"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="pl-9 pr-8 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 text-sm appearance-none cursor-pointer focus:border-sky-500/40 focus:outline-none"
          >
            <option value="">Toutes les actions</option>
            {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <select
          value={targetFilter}
          onChange={e => setTargetFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 text-sm appearance-none cursor-pointer focus:border-sky-500/40 focus:outline-none"
        >
          <option value="">Toutes les cibles</option>
          {targetTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[140px_1fr_1fr_120px_100px_40px] px-4 py-2 text-[10px] font-medium text-slate-600 uppercase tracking-wider border-b border-slate-800/40">
          <span>Date</span>
          <span>Utilisateur</span>
          <span>Action</span>
          <span>Cible</span>
          <span>IP</span>
          <span />
        </div>
        <div className="max-h-[calc(100vh-18rem)] overflow-y-auto divide-y divide-slate-800/20">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-600">Aucun log</p>
          ) : (
            filtered.map(log => {
              const isExpanded = expandedId === log.id;
              const hasDetails = log.details && Object.keys(log.details).length > 0;
              return (
                <div key={log.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="w-full text-left grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr_120px_100px_40px] items-center px-4 py-2.5 hover:bg-slate-800/30 transition-colors gap-1 sm:gap-0"
                  >
                    {/* Date */}
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-slate-600 shrink-0 hidden sm:block" />
                      <span className="text-xs text-slate-400 font-mono">{formatDate(log.created_at)}</span>
                      <span className="text-[10px] text-slate-600 sm:hidden">({relativeTime(log.created_at)})</span>
                    </div>
                    {/* User */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="h-3 w-3 text-slate-600 shrink-0 hidden sm:block" />
                      <span className="text-sm text-slate-300 truncate">{log.user_identifiant || 'Système'}</span>
                    </div>
                    {/* Action */}
                    <div className="min-w-0">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                      {log.target_type && (
                        <span className="ml-1.5 text-[11px] text-slate-500">{log.target_type}</span>
                      )}
                    </div>
                    {/* Target */}
                    <span className="text-xs text-slate-500 font-mono truncate hidden sm:block">{log.target_id ? log.target_id.slice(0, 12) : '—'}</span>
                    {/* IP */}
                    <div className="items-center gap-1 hidden sm:flex">
                      <Globe className="h-3 w-3 text-slate-600 shrink-0" />
                      <span className="text-xs text-slate-500 font-mono">{log.ip || '—'}</span>
                    </div>
                    {/* Expand */}
                    <div className="hidden sm:flex justify-center">
                      {hasDetails && (isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-600" />)}
                    </div>
                  </button>
                  {isExpanded && hasDetails && (
                    <div className="px-4 pb-3 sm:pl-[156px]">
                      <pre className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800/40 rounded-lg p-3 overflow-x-auto max-h-48 font-mono">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {totalFiltered > limit && (
          <div className="px-4 py-3 border-t border-slate-800/40 text-center">
            <button
              onClick={() => setLimit(l => l + 100)}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium"
            >
              Charger plus ({totalFiltered - limit} restants)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
