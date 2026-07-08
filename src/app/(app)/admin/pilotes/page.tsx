import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import CreatePiloteForm from './CreatePiloteForm';
import GenerateAllCardsButton from './GenerateAllCardsButton';
import RefreshAllCardsButton from './RefreshAllCardsButton';
import { WarnAllInactiveButton, InactivityLegend } from './InactivityWarningBadge';
import PilotesListClient, { type PiloteRow } from './PilotesListClient';

export const dynamic = 'force-dynamic';

import { INACTIVITY_THRESHOLD_DAYS } from '@/lib/admin/inactivity-warning';

const SEUIL_MS = INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

type InactivityStatus = 'warned' | 'dm_failed' | null;

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

export default async function AdminPilotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();

  const seuilIso = new Date(Date.now() - SEUIL_MS).toISOString();
  const [profilesRes, trackingResult, recentPlansResult, recentVolsResult] = await Promise.all([
    admin
      .from('profiles')
      .select('id, identifiant, role, heures_initiales_minutes, blocked_until, created_at, armee, atc, ifsa, siavi, ground_crew, inactivity_warning_status, inactivity_warned_at, inactivity_delete_after, inactivity_warning_error')
      .order('identifiant'),
    Promise.resolve(admin.from('user_login_tracking').select('user_id, last_login_at')).then(r => r.data).catch(() => null),
    Promise.resolve(
      admin.from('plans_vol')
        .select('pilote_id, created_at')
        .gte('created_at', seuilIso)
        .order('created_at', { ascending: false })
    ).then(r => r.data).catch(() => null),
    Promise.resolve(
      admin.from('vols')
        .select('pilote_id, created_at')
        .gte('created_at', seuilIso)
        .in('statut', ['validé', 'en_attente'])
        .order('created_at', { ascending: false })
    ).then(r => r.data).catch(() => null),
  ]);

  let profiles: unknown[] | null = profilesRes.data;
  if (profilesRes.error) {
    const fallback = await admin
      .from('profiles')
      .select('id, identifiant, role, heures_initiales_minutes, blocked_until, created_at, armee, atc, ifsa, siavi, ground_crew')
      .order('identifiant');
    profiles = fallback.data;
  }

  const lastLoginByUser: Record<string, string | null> = {};
  if (trackingResult) {
    for (const t of trackingResult) lastLoginByUser[t.user_id] = t.last_login_at;
  }

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
    siavi: boolean | null;
    ground_crew: boolean | null;
    inactivity_warning_status?: InactivityStatus;
    inactivity_warned_at?: string | null;
    inactivity_delete_after?: string | null;
    inactivity_warning_error?: string | null;
  };

  const withInactif: PiloteRow[] = ((profiles || []) as ProfileRow[]).map((p) => ({
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

  const inactifsNonAvertisCount = pilotes.filter(
    (p) => p.inactif1Mois && !p.warningStatus
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Gestion des comptes</h1>
      </div>

      <CreatePiloteForm />

      <div className="card p-4 space-y-4">
        <GenerateAllCardsButton />
        <RefreshAllCardsButton />
      </div>

      <InactivityLegend />

      {inactifsNonAvertisCount > 0 && (
        <div className="flex justify-end">
          <WarnAllInactiveButton count={inactifsNonAvertisCount} />
        </div>
      )}

      <PilotesListClient
        pilotes={pilotes}
        admins={admins}
        inactifsNonAvertisCount={inactifsNonAvertisCount}
      />
    </div>
  );
}
