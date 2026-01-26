import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Mail, Building2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import InvitationsClient from './InvitationsClient';

export default async function InvitationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Récupérer les invitations reçues en attente
  const { data: invitations } = await admin.from('compagnie_invitations')
    .select(`
      *,
      compagnie:compagnies!compagnie_id(id, nom, code_oaci)
    `)
    .eq('pilote_id', user.id)
    .eq('statut', 'en_attente')
    .order('created_at', { ascending: false });

  // Récupérer l'historique des invitations
  const { data: historique } = await admin.from('compagnie_invitations')
    .select(`
      *,
      compagnie:compagnies!compagnie_id(id, nom, code_oaci)
    `)
    .eq('pilote_id', user.id)
    .neq('statut', 'en_attente')
    .order('repondu_at', { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
        <div className="relative flex items-center gap-4">
          <Link href="/logbook" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </Link>
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur">
            <Mail className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Mes invitations</h1>
            <p className="text-emerald-100/80 text-sm">Offres d&apos;emploi des compagnies aériennes</p>
          </div>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-400/80 text-sm">Invitations en attente</p>
              <p className="text-2xl font-bold text-amber-400">{(invitations || []).length}</p>
            </div>
            <Mail className="h-8 w-8 text-amber-400/30" />
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-slate-500/10 to-slate-600/5 border border-slate-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400/80 text-sm">Historique récent</p>
              <p className="text-2xl font-bold text-slate-400">{(historique || []).length}</p>
            </div>
            <Building2 className="h-8 w-8 text-slate-400/30" />
          </div>
        </div>
      </div>

      <InvitationsClient
        invitations={(invitations || []).map(inv => ({
          id: inv.id,
          compagnie: Array.isArray(inv.compagnie) ? inv.compagnie[0] : inv.compagnie,
          message_invitation: inv.message_invitation,
          created_at: inv.created_at
        }))}
        historique={(historique || []).map(inv => ({
          id: inv.id,
          compagnie: Array.isArray(inv.compagnie) ? inv.compagnie[0] : inv.compagnie,
          statut: inv.statut,
          repondu_at: inv.repondu_at
        }))}
      />
    </div>
  );
}
