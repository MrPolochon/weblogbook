'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Bell, Check, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotifItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const POLL_INTERVAL_MS = 60_000;

export default function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const fetchNotifs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=20', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setItems((json.items as NotifItem[]) || []);
      setUnread(Number(json.unread_count) || 0);
    } catch { /* silencieux */ } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifs(true);
    const t = setInterval(() => fetchNotifs(true), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchNotifs]);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const dropdownW = Math.min(352, vw - 16);
      let right = Math.max(8, vw - r.right);
      if (vw - right - dropdownW < 8) {
        right = vw - dropdownW - 8;
      }
      setPos({ top: r.bottom + 6, right: Math.max(8, right) });
    }
    reposition();
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next) fetchNotifs();
      return next;
    });
  }

  async function markRead(id: string) {
    setBusyId(id);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnread((v) => Math.max(0, v - 1));
    } finally {
      setBusyId(null);
    }
  }

  async function markAll() {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
      setUnread(0);
    } catch { /* ignore */ }
  }

  async function removeOne(id: string) {
    setBusyId(id);
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setItems((prev) => prev.filter((n) => n.id !== id));
      setUnread((v) => {
        const target = items.find((n) => n.id === id);
        return target && !target.read_at ? Math.max(0, v - 1) : v;
      });
    } finally {
      setBusyId(null);
    }
  }

  function handleClick(item: NotifItem) {
    if (!item.read_at) markRead(item.id);
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        title="Notifications"
        aria-label="Notifications"
        className={cn(
          'relative flex items-center justify-center h-9 w-9 rounded-lg border transition-colors',
          open
            ? 'border-sky-500/50 bg-sky-500/20 text-sky-200'
            : 'border-slate-700/50 text-slate-300 hover:border-slate-500/50 hover:bg-slate-800 hover:text-white',
          className,
        )}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white ring-2 ring-[#0b0e1a]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {mounted && open && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-[min(22rem,calc(100vw-1rem))] max-h-[min(70vh,28rem)] overflow-hidden rounded-2xl border border-slate-600/60 bg-[#0d1120] shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-slate-300" />
              <span className="text-sm font-semibold text-slate-200">Notifications</span>
              {unread > 0 && (
                <span className="text-[10px] font-bold text-red-400">{unread} non lue{unread > 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  title="Tout marquer comme lu"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/10"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Tout lu</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex items-center justify-center h-7 w-7 rounded-md text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">Chargement…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                <div className="text-sm text-slate-400">Aucune notification</div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/60">
                {items.map((n) => {
                  const isUnread = !n.read_at;
                  return (
                    <li key={n.id} className={cn('relative group', isUnread && 'bg-sky-500/5')}>
                      <button
                        type="button"
                        onClick={() => handleClick(n)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-800/60 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          {isUnread && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-400" />
                          )}
                          <div className={cn('flex-1 min-w-0', !isUnread && 'pl-4')}>
                            <div className={cn('text-sm font-semibold truncate', isUnread ? 'text-sky-100' : 'text-slate-300')}>
                              {n.title}
                            </div>
                            {n.body && (
                              <div className="mt-0.5 text-xs text-slate-400 line-clamp-2">
                                {n.body}
                              </div>
                            )}
                            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                              {formatRelative(n.created_at)}
                            </div>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeOne(n.id); }}
                        disabled={busyId === n.id}
                        title="Supprimer"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center justify-center h-6 w-6 rounded-md text-slate-500 hover:bg-red-500/10 hover:text-red-300 transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'à l’instant';
    if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
    if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
    if (diff < 7 * 86_400_000) return `il y a ${Math.floor(diff / 86_400_000)} j`;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}
