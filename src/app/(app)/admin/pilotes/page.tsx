import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDuree } from '@/lib/utils';
import { formatDateUTC, formatDateMediumUTC, formatDateTimeUTC } from '@/lib/date-utils';
import { ArrowLeft } from 'lucide-react';
import CreatePiloteForm from './CreatePiloteForm';
import PilotesActions from './PilotesActions';
import GenerateAllCardsButton from './GenerateAllCardsButton';
import RefreshAllCardsButton from './RefreshAllCardsButton';
import InactivityWarningBadge, { WarnAllInactiveButton, InactivityLegend } from './InactivityWarningBadge';

export const dynamic = 'force-dynamic';

import { INACTIVITY_THRESHOLD_DAYS } from '@/lib/admin/inactivity-warning';

const SEUIL_MS = INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Un pilote est considéré inactif seulement si AUCUNE de ces activités
 * n'a eu lieu dans les INACTIVITY_THRESHOLD_DAYS jours :
 *  - connexion au site (last_login_at)
 *  - dépôt d'un plan de vol (last_plan_at)
 *  - enregistrement d'un vol (last_vol_at)
 */
function isInactifSeuil(
  createdAt: string,
  lastLoginAt: string | null,
  lastPlanAt: string | null,
  lastVolAt: string | null,
): boolean {
  const now = Date.now();
  const seuil = now - SEUIL_MS;
  const dates = [lastLoginAt, lastPlanAt, lastVolAt].filter(Boolean) as string[];
  if (dates.length === 0) return new Date(createdAt).getTime() < seuil;
  const lastActivity = Math.max(...dates.map(d => new Date(d).getTime()));
  return lastActivity < seuil;
}

type InactivityStatus = 'warned' | 'dm_failed' | null;

export default async function AdminPilotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();

  // Profiles + login tracking + activité de vol en parallèle
  // Defensive : on tente d'inclure les colonnes inactivity_*, fallback sans
  // si la migration add_inactivity_warnings.sql n'est pas encore appliquee.
  const seuilIso = new Date(Date.now() - SEUIL_MS).toISOString();
  const [profilesRes, trackingResult, recentPlansResult, recentVolsResult] = await Promise.all([
    admin
      .from('profiles')
      .select('id, identifiant, role, heures_initiales_minutes, blocked_until, created_at, armee, atc, ifsa, inactivity_warning_status, inactivity_warned_at, inactivity_delete_after, inactivity_warning_error')
      .order('identifiant'),
    Promise.resolve(admin.from('user_login_tracking').select('user_id, last_login_at')).then(r => r.data).catch(() => null),
    // Dernier plan de vol par pilote (dans le seuil)
    admin.from('plans_vol')
      .select('pilote_id, created_at')
      .gte('created_at', seuilIso)
      .order('created_at', { ascending: false })
      .then(r => r.data).catch(() => null),
    // Dernier vol validé par pilote (dans le seuil)
    admin.from('vols')
      .select('pilote_id, created_at')
      .gte('created_at', seuilIso)
      .in('statut', ['validé', 'en_attente'])
      .order('created_at', { ascending: false })
      .then(r => r.data).catch(() => null),
  ]);

  let profiles: unknown[] | null = profilesRes.data;
  if (profilesRes.error) {
    // Fallback : selecte sans les colonnes inactivity_*
    const fallback = await admin
      .from('profiles')
      .select('id, identifiant, role, heures_initiales_minutes, blocked_until, created_at, armee, atc, ifsa')
      .order('identifiant');
    profiles = fallback.data;
  }

  const lastLoginByUser: Record<string, string | null> = {};
  if (trackingResult) {
    for (const t of trackingResult) lastLoginByUser[t.user_id] = t.last_login_at;
  }

  // Dernière activité de vol par pilote (plans + vols validés)
  const lastPlanByPilote: Record<string, string | null> = {};
  for (const p of recentPlansResult ?? []) {
    const pid = p.pilote_id as string;
    if (!lastPlanByPilote[pid] || (p.created_at as string) > lastPlanByPilote[pid]!) {
      lastPlanByPilote[pid] = p.created_at as string;
    }
  }
  const lastVolByPilote: Record<string, string | null> = {};
  for (const v of recentVolsResult ?? []) {
    const pid = v.pilote_id as string;
    if (!lastVolByPilote[pid] || (v.created_at as string) > lastVolByPilote[pid]!) {
      lastVolByPilote[pid] = v.created_at as string;
    }
  }

  type ProfileRow = {
    id: string;
    identifiant: string;
    role: string | null;
    heures_initiales_minutes: number | null;
    blocked_until: string | null;
    created_at: string;
    armee: boolean | null;
    atc: boolean | null;
    ifsa: boolean | null;
    inactivity_warning_status?: InactivityStatus;
    inactivity_warned_at?: string | null;
    inactivity_delete_after?: string | null;
    inactivity_warning_error?: string | null;
  };

  const withInactif = ((profiles || []) as ProfileRow[]).map((p) => ({
    ...p,
    last_login_at: lastLoginByUser[p.id] ?? null,
    last_plan_at: lastPlanByPilote[p.id] ?? null,
    last_vol_at: lastVolByPilote[p.id] ?? null,
    inactif1Mois: isInactifSeuil(
      p.created_at,
      lastLoginByUser[p.id] ?? null,
      lastPlanByPilote[p.id] ?? null,
      lastVolByPilote[p.id] ?? null,
    ),
    warningStatus: (p.inactivity_warning_status ?? null) as InactivityStatus,
    warnedAt: p.inactivity_warned_at ?? null,
    deleteAfter: p.inactivity_delete_after ?? null,
    warningError: p.inactivity_warning_error ?? null,
  }));

  const pilotes = withInactif.filter((p) => p.role !== 'admin');
  const admins = withInactif.filter((p) => p.role === 'admin');

  // Compteur des inactifs PAS ENCORE avertis (= ceux qui doivent recevoir un DM)
  const inactifsNonAvertisCount = pilotes.filter(
    (p) => p.inactif1Mois && !p.warningStatus
  ).length;

  const renderRow = (p: (typeof pilotes)[number] | (typeof admins)[number], isAdminRole: boolean) => {
    const blocked = p.blocked_until ? new Date(p.blocked_until) > new Date() : false;
    const sansEspacePilote = p.role === 'atc' || p.role === 'siavi';
    const roleLabel =
      p.role === 'admin'
        ? 'admin'
        : p.role === 'atc'
          ? 'atc'
          : p.role === 'siavi'
            ? 'siavi'
            : p.role === 'instructeur'
              ? 'instructeur'
              : 'pilote';
    return (
      <tr
        key={p.id}
        className={`border-b border-slate-700/50 ${p.inactif1Mois ? 'bg-red-500/15' : ''}`}
      >
        <td className="py-3 pr-4 font-medium text-slate-200">
          <div className="flex items-center gap-2 flex-wrap">
            <span>{p.identifiant}</span>
            {p.inactif1Mois && !isAdminRole && (
              <InactivityWarningBadge
                userId={p.id}
                identifiant={p.identifiant}
                status={p.warningStatus}
                warnedAt={p.warnedAt}
                deleteAfter={p.deleteAfter}
                errorMsg={p.warningError}
              />
            )}
          </div>
        </td>
        <td className="py-3 pr-4 text-slate-300">{roleLabel}</td>
        <td className="py-3 pr-4 text-slate-300">{p.armee ? 'Oui' : '—'}</td>
        <td className="py-3 pr-4 text-slate-300">{p.atc ? 'Oui' : '—'}</td>
        <td className="py-3 pr-4 text-slate-300">{p.ifsa ? <span className="text-indigo-400">Oui</span> : '—'}</td>
        <td className="py-3 pr-4">
          {sansEspacePilote ? (
            <span className="inline-flex items-center rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300" title="Pas d'accès à l'espace pilote">ATC uniquement</span>
          ) : (
            <span className="text-slate-500">Oui</span>
          )}
        </td>
        <td className="py-3 pr-4 text-slate-300">{formatDuree(p.heures_initiales_minutes ?? 0)}</td>
        <td className="py-3 pr-4 text-slate-400 text-xs whitespace-nowrap" title="Enregistré à la connexion (IP / code email)">
          {p.last_login_at ? formatDateTimeUTC(p.last_login_at) : '—'}
        </td>
        <td className="py-3 pr-4">
          {blocked ? (
            <span className="text-amber-400">
              Jusqu&apos;au {formatDateUTC(p.blocked_until!, 'dd/MM/yyyy HH:mm')} UTC
            </span>
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </td>
        <td className="py-3 pr-4 text-slate-400 text-xs">
          {formatDateMediumUTC(p.created_at)}
        </td>
        <td className="py-3">
          <PilotesActions piloteId={p.id} identifiant={p.identifiant} isAdmin={isAdminRole} role={p.role ?? undefined} />
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Pilotes, instructeurs et admins</h1>
      </div>

      <CreatePiloteForm />

      <div className="card p-4 space-y-4">
        <GenerateAllCardsButton />
        <RefreshAllCardsButton />
      </div>

      <InactivityLegend />

      <div className="card">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-lg font-medium text-slate-200">Pilotes</h2>
          <WarnAllInactiveButton count={inactifsNonAvertisCount} />
        </div>
        {pilotes.length === 0 ? (
          <p className="text-slate-500">Aucun pilote.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="pb-2 pr-4">Identifiant</th>
                  <th className="pb-2 pr-4">Rôle principal</th>
                  <th className="pb-2 pr-4">Armée</th>
                  <th className="pb-2 pr-4">ATC</th>
                  <th className="pb-2 pr-4">IFSA</th>
                  <th className="pb-2 pr-4">Espace pilote</th>
                  <th className="pb-2 pr-4">Heures initiales</th>
                  <th className="pb-2 pr-4">Dernière connexion</th>
                  <th className="pb-2 pr-4">Blocage</th>
                  <th className="pb-2 pr-4">Créé le</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>{pilotes.map((p) => renderRow(p, false))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Admins</h2>
        {admins.length === 0 ? (
          <p className="text-slate-500">Aucun admin.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="pb-2 pr-4">Identifiant</th>
                  <th className="pb-2 pr-4">Rôle principal</th>
                  <th className="pb-2 pr-4">Armée</th>
                  <th className="pb-2 pr-4">ATC</th>
                  <th className="pb-2 pr-4">IFSA</th>
                  <th className="pb-2 pr-4">Espace pilote</th>
                  <th className="pb-2 pr-4">Heures initiales</th>
                  <th className="pb-2 pr-4">Dernière connexion</th>
                  <th className="pb-2 pr-4">Blocage</th>
                  <th className="pb-2 pr-4">Créé le</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>{admins.map((p) => renderRow(p, true))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
