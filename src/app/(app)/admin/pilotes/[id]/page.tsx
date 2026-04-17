import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import EditPiloteForm from './EditPiloteForm';
import PiloteCarteSection from './PiloteCarteSection';
import AdminProfileEmail from './AdminProfileEmail';

const DISCORD_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:          { label: 'Actif',              color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  pending:         { label: 'En attente',         color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  missing_guild:   { label: 'Pas sur le serveur', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  missing_role:    { label: 'Rôle manquant',      color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  temporary_block: { label: 'Bloqué (temporaire)',color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  permanent_block: { label: 'Bloqué (permanent)', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
};

export default async function AdminPiloteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user: editor } } = await supabase.auth.getUser();

  const { data: p } = await supabase
    .from('profiles')
    .select('id, identifiant, role, armee, atc, ifsa, siavi, heures_initiales_minutes, blocked_until, block_reason, email')
    .eq('id', id)
    .single();

  if (!p) notFound();

  const admin = createAdminClient();

  const [{ data: carte }, { data: discordLink }] = await Promise.all([
    admin.from('cartes_identite').select('*').eq('user_id', id).single(),
    admin.from('discord_links').select('*').eq('user_id', id).single(),
  ]);

  const ds = discordLink ? DISCORD_STATUS_LABELS[discordLink.status] ?? { label: discordLink.status, color: 'text-slate-400 bg-slate-500/10 border-slate-500/30' } : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/admin/pilotes" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Modifier {p.identifiant}</h1>
        {p.role !== 'atc' && (
          <Link
            href={`/admin/pilotes/${id}/logbook`}
            className="btn-secondary inline-flex items-center gap-2"
          >
            Voir le logbook
          </Link>
        )}
      </div>

      {/* Section Discord */}
      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-3">Discord</h2>
        {discordLink ? (
          <div className="flex flex-wrap items-center gap-4">
            {discordLink.discord_avatar && (
              <img
                src={`https://cdn.discordapp.com/avatars/${discordLink.discord_user_id}/${discordLink.discord_avatar}.png?size=64`}
                alt=""
                className="w-10 h-10 rounded-full"
              />
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-slate-100 font-medium">{discordLink.discord_username}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${ds!.color}`}>{ds!.label}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>ID : <span className="font-mono text-slate-300">{discordLink.discord_user_id}</span></span>
                <span>{discordLink.guild_member ? '✅ Sur le serveur' : '❌ Pas sur le serveur'}</span>
                <span>{discordLink.has_required_role ? '✅ Rôle vérifié' : '❌ Rôle manquant'}</span>
                <span>Lié le {new Date(discordLink.linked_at).toLocaleDateString('fr-FR')}</span>
              </div>
              {discordLink.sanction_reason && (
                <p className="text-xs text-red-400 mt-1">Sanction : {discordLink.sanction_reason}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Ce compte n&apos;a pas lié de compte Discord.</p>
        )}
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Formulaire d'édition - priorité */}
        <div className="flex-1 min-w-0 space-y-6">
          <AdminProfileEmail profileId={p.id} initialEmail={p.email ?? null} />
          <EditPiloteForm
            piloteId={p.id}
            identifiant={p.identifiant ?? ''}
            role={p.role ?? 'pilote'}
            armee={Boolean(p.armee)}
            atc={Boolean(p.atc)}
            ifsa={Boolean(p.ifsa)}
            siavi={Boolean(p.siavi)}
            heuresInitiales={p.heures_initiales_minutes ?? 0}
            blockedUntil={p.blocked_until}
            blockReason={p.block_reason}
            editorUserId={editor?.id ?? null}
          />
        </div>

        {/* Carte d'identité - sidebar */}
        <div className="w-full xl:w-auto flex-shrink-0">
          <PiloteCarteSection 
            userId={p.id} 
            identifiant={p.identifiant ?? ''} 
            initialCarte={carte} 
          />
        </div>
      </div>
    </div>
  );
}
