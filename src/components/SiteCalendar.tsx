'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Megaphone, Plus, Trash2, X,
} from 'lucide-react';
import type { CalendarEvent, DiscordCalendarTarget } from '@/lib/calendrier/types';
import Link from 'next/link';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import { majorConfigSchema, majorConfigError, MAJOR_EVENT_MAX_MOVEMENTS } from '@/lib/events/rules';
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
  is_major: boolean;
  airports: string[];
  slot_minutes: number;
  pilot_capacity: number;
  atc_positions: string[];
  enabled: boolean;
  bookings_open: boolean;
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
  is_major: false, airports: [], slot_minutes: 10, pilot_capacity: 5, atc_positions: [...ATC_POSITIONS], enabled: true, bookings_open: true,
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
    is_major: Boolean(e.is_major), airports: e.major?.airports || [], slot_minutes: e.major?.slot_minutes || 10,
    pilot_capacity: e.major?.pilot_capacity || 5, atc_positions: e.major?.atc_positions || [...ATC_POSITIONS],
    enabled: e.major?.enabled ?? true, bookings_open: e.major?.bookings_open ?? true,
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
      if (!res.ok) throw new Error(data.error || 'Chargement impossible');
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible');
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
      const first = Date.parse(`${key}T00:00:00Z`);
      const last = e.is_major && e.ends_at ? Math.min(Date.parse(e.ends_at)-1,first+7*86400000) : first;
      for (let at=first;at<=last;at+=86400000) {
        const day = utcDayKeyFromDate(new Date(at));
        const list = map.get(day) || []; list.push(e); map.set(day,list);
      }
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
        is_major: form.is_major,
        ...(form.is_major ? { major: { airports: form.airports, slot_minutes: form.slot_minutes, pilot_capacity: form.pilot_capacity,
          atc_positions: form.atc_positions, enabled: form.enabled, bookings_open: form.bookings_open } } : {}),
        title: form.title,
        description: form.description,
        location: form.location,
        starts_at: starts,
        ends_at: ends,
        announce_discord: form.announce_discord,
        announce_channel_id: form.announce_channel_id || null,
        announce_role_id: form.announce_role_id || null,
      };
      if (form.is_major) {
        const config = majorConfigSchema.safeParse(payload.major);
        if (!config.success) { setError(majorConfigError(config.error)); return; }
        if (!ends || new Date(ends).getTime() <= new Date(starts).getTime() || new Date(ends).getTime() - new Date(starts).getTime() > 7 * 86400000) {
          setError('Un événement majeur nécessite une fin après son début, au maximum 7 jours plus tard.'); return;
        }
      }
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
      {error && !creating && <p role="alert" className="rounded-lg border border-red-400/40 p-3">{error} <button className="underline" onClick={() => { setError(null); void load(); }}>Réessayer</button></p>}
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
                    {e.is_major && <p className="text-xs font-semibold text-amber-300">ÉVÉNEMENT MAJEUR{e.major?.enabled ? ' · plans de vol libres' : ' · désactivé'}</p>}
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
                    {e.is_major && <Link className="inline-flex mt-3 underline font-semibold text-sky-400" href={`/evenements/${e.id}`}>Réserver un slot pilote / ATC · Voir le manifeste</Link>}
                    {e.announce_discord && canEdit && (
                      <p className={`text-xs mt-2 flex items-center gap-1 ${muted}`}>
                        <Megaphone className="h-3 w-3" />
                        Annonce Discord {e.announce_sent_at ? 'envoyée' : 'prévue au début'}
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
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 p-4 space-y-3">
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
              <input type="checkbox" disabled={Boolean(editing?.is_major)} checked={form.is_major} onChange={e => setForm({ ...form, is_major: e.target.checked })}/>
              Événement majeur — réservations facultatives pour les pilotes et les positions ATC libres
            </label>
            {form.is_major && <fieldset className="space-y-3 border border-amber-500/30 rounded-lg p-3"><legend>Créneaux et restrictions</legend>
              <p className="text-xs text-slate-400">Après la première réservation, les horaires, aéroports et capacités sont verrouillés pour préserver les places déjà prises.</p>
              <div className="grid grid-cols-2 gap-2">{AEROPORTS_PTFS.map(a => <label key={a.code} className="text-xs flex gap-2 items-center"><input type="checkbox" checked={form.airports.includes(a.code)} onChange={e => setForm({ ...form, airports: e.target.checked ? [...form.airports,a.code] : form.airports.filter(c => c !== a.code) })}/>{a.code} — {a.nom}</label>)}</div>
              <label className="block text-sm">Durée d’un slot pilote (minutes)<input type="number" min={5} max={60} className="input w-full" value={form.slot_minutes} onChange={e => setForm({ ...form, slot_minutes: Number(e.target.value) })}/></label>
              <label className="block text-sm">Mouvements par aéroport et par créneau (1–{MAJOR_EVENT_MAX_MOVEMENTS})<input type="number" min={1} max={MAJOR_EVENT_MAX_MOVEMENTS} step={1} aria-describedby="major-capacity-help" aria-invalid={!Number.isInteger(form.pilot_capacity) || form.pilot_capacity < 1 || form.pilot_capacity > MAJOR_EVENT_MAX_MOVEMENTS} className="input w-full aria-[invalid=true]:border-red-500" value={form.pilot_capacity} onChange={e => setForm({ ...form, pilot_capacity: Number(e.target.value) })}/></label>
              <p id="major-capacity-help" className="text-xs text-slate-400">Un mouvement correspond à un départ ou une arrivée. Cette capacité s’applique à chaque aéroport pour chaque créneau de {form.slot_minutes} minutes, et non à tout l’événement. Exemple : 5 mouvements par créneau de 10 minutes = 30 mouvements par heure et par aéroport.</p>
              <div className="flex flex-wrap gap-3">{ATC_POSITIONS.map(p => <label key={p} className="text-xs flex gap-1"><input type="checkbox" checked={form.atc_positions.includes(p)} onChange={e => setForm({ ...form, atc_positions: e.target.checked ? [...form.atc_positions,p] : form.atc_positions.filter(c => c !== p) })}/>{p}</label>)}</div>
              <label className="flex gap-2"><input type="checkbox" checked={form.bookings_open} onChange={e => setForm({ ...form, bookings_open: e.target.checked })}/>Inscriptions ouvertes</label>
              <label className="flex gap-2"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })}/>Événement actif (décocher pour l’annuler)</label>
            </fieldset>}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.announce_discord} onChange={(e) => setForm({ ...form, announce_discord: e.target.checked })} />
              Annonce Discord au début de l’événement
            </label>
            {form.announce_discord && (
              <p className="text-xs text-slate-400 -mt-1">
                Envoyée à l’heure de début UTC, pas à l’enregistrement.
              </p>
            )}
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
