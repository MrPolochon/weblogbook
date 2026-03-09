import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDuree } from '@/lib/utils';
import { formatDateUTC, formatDateMediumUTC } from '@/lib/date-utils';
import { ArrowLeft } from 'lucide-react';
import CreatePiloteForm from './CreatePiloteForm';
import PilotesActions from './PilotesActions';
import GenerateAllCardsButton from './GenerateAllCardsButton';
import RefreshAllCardsButton from './RefreshAllCardsButton';

const UN_MOIS_MS = 30 * 24 * 60 * 60 * 1000;

function isInactif1Mois(createdAt: string, lastLoginAt: string | null): boolean {
  const now = Date.now();
  const seuil = now - UN_MOIS_MS;
  if (lastLoginAt) return new Date(lastLoginAt).getTime() < seuil;
  return new Date(createdAt).getTime() < seuil;
}

export default async function AdminPilotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, identifiant, role, heures_initiales_minutes, blocked_until, created_at, armee, atc, ifsa')
    .order('identifiant');

  let lastLoginByUser: Record<string, string | null> = {};
  try {
    const { data: tracking } = await admin.from('user_login_tracking').select('user_id, last_login_at');
    if (tracking) lastLoginByUser = Object.fromEntries(tracking.map((t) => [t.user_id, t.last_login_at]));
  } catch {
    // Table peut ne pas exister
  }

  const withInactif = (profiles || []).map((p) => ({
    ...p,
    last_login_at: lastLoginByUser[p.id] ?? null,
    inactif1Mois: isInactif1Mois(p.created_at, lastLoginByUser[p.id] ?? null),
  }));

  const pilotes = withInactif.filter((p) => p.role !== 'admin');
  const admins = withInactif.filter((p) => p.role === 'admin');

  const renderRow = (p: (typeof pilotes)[number] | (typeof admins)[number], isAdminRole: boolean) => {
    const blocked = p.blocked_until ? new Date(p.blocked_until) > new Date() : false;
    const sansEspacePilote = p.role === 'atc';
    return (
      <tr
        key={p.id}
        className={`border-b border-slate-700/50 ${p.inactif1Mois ? 'bg-red-500/15' : ''}`}
      >
        <td className="py-3 pr-4 font-medium text-slate-200">{p.identifiant}</td>
        <td className="py-3 pr-4 text-slate-300">{p.role === 'admin' ? 'admin' : p.role === 'atc' ? 'atc' : 'pilote'}</td>
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
          <PilotesActions piloteId={p.id} identifiant={p.identifiant} isAdmin={isAdminRole} role={p.role} />
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
        <h1 className="text-2xl font-semibold text-slate-100">Pilotes et admins</h1>
      </div>

      <CreatePiloteForm />

      <div className="card p-4 space-y-4">
        <GenerateAllCardsButton />
        <RefreshAllCardsButton />
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Pilotes</h2>
        {pilotes.length === 0 ? (
          <p className="text-slate-500">Aucun pilote.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="pb-2 pr-4">Identifiant</th>
                  <th className="pb-2 pr-4">Pilote / Admin</th>
                  <th className="pb-2 pr-4">Armée</th>
                  <th className="pb-2 pr-4">ATC</th>
                  <th className="pb-2 pr-4">IFSA</th>
                  <th className="pb-2 pr-4">Espace pilote</th>
                  <th className="pb-2 pr-4">Heures initiales</th>
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
                  <th className="pb-2 pr-4">Pilote / Admin</th>
                  <th className="pb-2 pr-4">Armée</th>
                  <th className="pb-2 pr-4">ATC</th>
                  <th className="pb-2 pr-4">IFSA</th>
                  <th className="pb-2 pr-4">Espace pilote</th>
                  <th className="pb-2 pr-4">Heures initiales</th>
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
