'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Megaphone, Plus, Trash2, X,
} from 'lucide-react';
import type { CalendarEvent, DiscordCalendarTarget } from '@/lib/calendrier/types';
import {
  formatEventDateTime,
  formatEventTime,
  utcDayKey,
  utcDayKeyFromDate,
  utcInputToUtcIso,
  utcIsoToUtcInput,
} from '@/lib/calendrier/time';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function addMonthsUtc(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

function gridDaysUtc(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const startUtc = Date.UTC(year, month, 1 - mondayOffset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(startUtc + i * 86_400_000));
  }
  return days;
}

type Variant = 'dark' | 'light' | 'siavi';

type FormState = {
  title: string;
  description: string;
  location: string;
  starts_utc: string;
  ends_utc: string;
  announce_discord: boolean;
  announce_channel_id: string;
  announce_role_id: string;
};

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  location: '',
  starts_utc: '',
  ends_utc: '',
  announce_discord: false,
  announce_channel_id: '',
  announce_role_id: '',
});

function eventToForm(e: CalendarEvent): FormState {
  return {
    title: e.title,
    description: e.description || '',
    location: e.location || '',
    starts_utc: utcIsoToUtcInput(e.starts_at),
    ends_utc: e.ends_at ? utcIsoToUtcInput(e.ends_at) : '',
    announce_discord: Boolean(e.announce_discord),
    announce_channel_id: e.announce_channel_id || '',
    announce_role_id: e.announce_role_id || '',
  };
}

export default function SiteCalendar({
  canEdit = false,
  variant = 'dark',
}: {
  canEdit?: boolean;
  variant?: Variant;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(utcDayKeyFromDate(now));
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [channels, setChannels] = useState<DiscordCalendarTarget[]>([]);
  const [roles, setRoles] = useState<DiscordCalendarTarget[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/calendrier', { cache: 'no-store' });
      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!creating && !pendingDeleteId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setCreating(false);
      setPendingDeleteId(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [creating, pendingDeleteId]);

  useEffect(() => {
    if (!canEdit) return;
    fetch('/api/calendrier/discord-targets')
      .then((r) => r.json())
      .then((d) => {
        setChannels(Array.isArray(d.channels) ? d.channels : []);
        setRoles(Array.isArray(d.roles) ? d.roles : []);
      })
      .catch(() => {});
  }, [canEdit]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = utcDayKey(e.starts_at);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const days = useMemo(() => gridDaysUtc(year, month), [year, month]);
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const todayKey = utcDayKeyFromDate(new Date());
  const selectedEvents = selectedDay ? (byDay.get(selectedDay) || []) : [];

  function openCreate(day?: string) {
    const base = emptyForm();
    if (day) base.starts_utc = utcIsoToUtcInput(`${day}T18:00:00.000Z`);
    setForm(base);
    setEditing(null);
    setCreating(true);
    setError(null);
  }

  function openEdit(e: CalendarEvent) {
    setForm(eventToForm(e));
    setEditing(e);
    setCreating(true);
    setError(null);
  }

  async function save() {
    const starts = utcInputToUtcIso(form.starts_utc);
    if (!starts) {
      setError('Indique le début (UTC).');
      return;
    }
    const ends = form.ends_utc ? utcInputToUtcIso(form.ends_utc) : null;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        location: form.location,
        starts_at: starts,
        ends_at: ends,
        announce_discord: form.announce_discord,
        announce_channel_id: form.announce_channel_id || null,
        announce_role_id: form.announce_role_id || null,
      };
      const url = editing ? `/api/calendrier/${editing.id}` : '/api/calendrier';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Enregistrement impossible');
        return;
      }
      setCreating(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/calendrier/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setPendingDeleteId(null);
      await load();
    }
  }

  const shell =
    variant === 'siavi'
      ? 'text-red-50'
      : variant === 'light'
        ? 'text-slate-800'
        : 'text-slate-100';
  const card =
    variant === 'siavi'
      ? 'border-red-400/25 bg-red-950/40'
      : variant === 'light'
        ? 'border-slate-200 bg-white'
        : 'border-slate-800/70 bg-slate-900/50';
  const muted = variant === 'light' ? 'text-slate-500' : 'text-slate-400';
  const chip =
    variant === 'siavi'
      ? 'bg-red-500/20 text-red-100'
      : variant === 'light'
        ? 'bg-sky-100 text-sky-800'
        : 'bg-sky-500/15 text-sky-200';

  return (
    <div className={`space-y-4 ${shell}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary px-2 py-1"
            aria-label={`Mois précédent : ${monthLabel} UTC`}
            onClick={() => {
              const n = addMonthsUtc(year, month, -1);
              setYear(n.year); setMonth(n.month);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 id="site-calendar-month" className="min-w-[10rem] text-center text-lg font-semibold capitalize">
            {monthLabel} UTC
          </h2>
          <button
            type="button"
            className="btn-secondary px-2 py-1"
            aria-label={`Mois suivant : ${monthLabel} UTC`}
            onClick={() => {
              const n = addMonthsUtc(year, month, 1);
              setYear(n.year); setMonth(n.month);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className={`text-xs ${muted}`}>
          UTC d’abord · heure locale de l’appareil entre parenthèses
        </div>
        {canEdit && (
          <button type="button" className="btn-primary" onClick={() => openCreate(selectedDay || undefined)}>
            <Plus className="h-4 w-4 inline mr-1" />
            Nouvel événement
          </button>
        )}
      </div>

      <div className={`rounded-xl border ${card} overflow-hidden`}>
        <div className="grid grid-cols-7 text-[11px] font-semibold uppercase tracking-wide opacity-70">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-t border-current/10">
          {days.map((d) => {
            const key = utcDayKeyFromDate(d);
            const inMonth = d.getUTCMonth() === month;
            const dayEvents = byDay.get(key) || [];
            const isToday = key === todayKey;
            const isSelected = key === selectedDay;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(key)}
                className={`min-h-[5.5rem] border-r border-b border-current/10 px-1.5 py-1.5 text-left transition-colors ${
                  inMonth ? '' : 'opacity-35'
                } ${isSelected ? 'ring-2 ring-inset ring-sky-400/70' : ''} ${
                  isToday ? 'bg-sky-500/10' : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isToday ? 'text-sky-300' : ''}`}>{d.getUTCDate()}</span>
                  {dayEvents.length > 0 && (
                    <span className={`rounded-full px-1.5 text-[10px] ${chip}`}>{dayEvents.length}</span>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 2).map((e) => (
                    <div key={e.id} className={`truncate rounded px-1 py-0.5 text-[10px] ${chip}`}>
                      {formatEventTime(e.starts_at)} {e.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className={`text-[10px] ${muted}`}>+{dayEvents.length - 2}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`rounded-xl border ${card} p-4 space-y-3`}>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          <h3 className="font-semibold">
            {selectedDay
              ? new Date(selectedDay + 'T00:00:00.000Z').toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                }) + ' UTC'
              : 'Sélectionne un jour'}
          </h3>
        </div>
        {loading ? (
          <p className={`text-sm ${muted}`}>Chargement…</p>
        ) : selectedEvents.length === 0 ? (
          <p className={`text-sm ${muted}`}>Aucun événement ce jour.</p>
        ) : (
          <ul className="space-y-2">
            {selectedEvents.map((e) => (
              <li key={e.id} className={`rounded-lg border border-current/10 p-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{e.title}</p>
                    <p className="text-sm mt-0.5 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatEventDateTime(e.starts_at)}
                      {e.ends_at ? ` → ${formatEventTime(e.ends_at)}` : ''}
                    </p>
                    {e.location && (
                      <p className={`text-sm mt-1 flex items-center gap-1.5 ${muted}`}>
                        <MapPin className="h-3.5 w-3.5" /> {e.location}
                      </p>
                    )}
                    {e.description && <p className="text-sm mt-2 whitespace-pre-wrap">{e.description}</p>}
                    {e.announce_discord && canEdit && (
                      <p className={`text-xs mt-2 flex items-center gap-1 ${muted}`}>
                        <Megaphone className="h-3 w-3" />
                        Annonce Discord {e.announced_at ? 'envoyée' : 'prévue'}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button type="button" className="btn-secondary text-xs" onClick={() => openEdit(e)}>Modifier</button>
                      <button type="button" className="btn-secondary text-xs px-2" aria-label="Supprimer l’événement" onClick={() => setPendingDeleteId(e.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="site-calendar-dialog-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setCreating(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 id="site-calendar-dialog-title" className="font-semibold">
                {editing ? 'Modifier l’événement' : 'Nouvel événement'}
              </h3>
              <button type="button" aria-label="Fermer" onClick={() => setCreating(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-slate-400">
              Saisie UTC. Affichage ailleurs : 19H UTC (7h Local).
            </p>
            <input className="input" placeholder="Titre" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea className="input min-h-[72px]" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input className="input" placeholder="Lieu (optionnel)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <label className="text-xs text-slate-400">Début (UTC)
              <input type="datetime-local" className="input mt-1" value={form.starts_utc} onChange={(e) => setForm({ ...form, starts_utc: e.target.value })} />
            </label>
            <label className="text-xs text-slate-400">Fin (optionnel, UTC)
              <input type="datetime-local" className="input mt-1" value={form.ends_utc} onChange={(e) => setForm({ ...form, ends_utc: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.announce_discord} onChange={(e) => setForm({ ...form, announce_discord: e.target.checked })} />
              Avertir via une annonce Discord
            </label>
            {form.announce_discord && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-xs text-slate-400">Salon
                  <select className="input mt-1" value={form.announce_channel_id} onChange={(e) => setForm({ ...form, announce_channel_id: e.target.value })}>
                    <option value="">Choisir un salon…</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-400">Ping
                  <select className="input mt-1" value={form.announce_role_id} onChange={(e) => setForm({ ...form, announce_role_id: e.target.value })}>
                    <option value="">Aucun ping</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Annuler</button>
              <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteId && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="site-calendar-delete-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPendingDeleteId(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 p-4 space-y-3">
            <h3 id="site-calendar-delete-title" className="font-semibold">Supprimer cet événement ?</h3>
            <p className="text-sm text-slate-400">Cette action est définitive.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPendingDeleteId(null)}>Annuler</button>
              <button type="button" className="btn-primary" onClick={() => void remove(pendingDeleteId)}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
