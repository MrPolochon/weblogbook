import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Shield, FileSearch, AlertTriangle, Gavel, Users } from 'lucide-react';
import IfsaClient from './IfsaClient';

export default async function IfsaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Vérifier si l'utilisateur est IFSA ou admin
  const { data: profile } = await supabase.from('profiles')
    .select('role, ifsa')
    .eq('id', user.id)
    .single();

  if (!profile?.ifsa && profile?.role !== 'admin') {
    redirect('/logbook');
  }

  const admin = createAdminClient();

  // Récupérer les signalements
  const { data: signalements } = await admin.from('ifsa_signalements')
    .select(`
      *,
      signale_par:profiles!signale_par_id(id, identifiant),
      pilote_signale:profiles!pilote_signale_id(id, identifiant),
      compagnie_signalee:compagnies!compagnie_signalee_id(id, nom),
      traite_par:profiles!traite_par_id(id, identifiant)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  // Récupérer les enquêtes
  const { data: enquetes } = await admin.from('ifsa_enquetes')
    .select(`
      *,
      pilote_concerne:profiles!pilote_concerne_id(id, identifiant),
      compagnie_concernee:compagnies!compagnie_concernee_id(id, nom),
      enqueteur:profiles!enqueteur_id(id, identifiant),
      ouvert_par:profiles!ouvert_par_id(id, identifiant)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  // Récupérer les sanctions actives
  const { data: sanctions } = await admin.from('ifsa_sanctions')
    .select(`
      *,
      cible_pilote:profiles!cible_pilote_id(id, identifiant),
      cible_compagnie:compagnies!cible_compagnie_id(id, nom),
      emis_par:profiles!emis_par_id(id, identifiant),
      cleared_by:profiles!cleared_by_id(id, identifiant)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  // Récupérer les pilotes et compagnies pour les formulaires
  const { data: pilotes } = await admin.from('profiles')
    .select('id, identifiant')
    .order('identifiant');

  const { data: compagnies } = await admin.from('compagnies')
    .select('id, nom')
    .order('nom');

  // Récupérer les agents IFSA
  const { data: agentsIfsa } = await admin.from('profiles')
    .select('id, identifiant')
    .or('ifsa.eq.true,role.eq.admin')
    .order('identifiant');

  // Stats
  const signalementsNouveaux = (signalements || []).filter(s => s.statut === 'nouveau').length;
  const enquetesOuvertes = (enquetes || []).filter(e => e.statut === 'ouverte' || e.statut === 'en_cours').length;
  const sanctionsActives = (sanctions || []).filter(s => s.actif).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">IFSA - International Flight Safety Authority</h1>
            <p className="text-indigo-100/80 text-sm">Gestion des signalements, enquêtes et sanctions</p>
          </div>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-400/80 text-sm">Nouveaux signalements</p>
              <p className="text-2xl font-bold text-blue-400">{signalementsNouveaux}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-blue-400/30" />
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-400/80 text-sm">Enquêtes ouvertes</p>
              <p className="text-2xl font-bold text-purple-400">{enquetesOuvertes}</p>
            </div>
            <FileSearch className="h-8 w-8 text-purple-400/30" />
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-400/80 text-sm">Sanctions actives</p>
              <p className="text-2xl font-bold text-red-400">{sanctionsActives}</p>
            </div>
            <Gavel className="h-8 w-8 text-red-400/30" />
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-400/80 text-sm">Agents IFSA</p>
              <p className="text-2xl font-bold text-emerald-400">{(agentsIfsa || []).length}</p>
            </div>
            <Users className="h-8 w-8 text-emerald-400/30" />
          </div>
        </div>
      </div>

      <IfsaClient
        signalements={(signalements || []).map(s => ({
          ...s,
          signale_par: Array.isArray(s.signale_par) ? s.signale_par[0] : s.signale_par,
          pilote_signale: Array.isArray(s.pilote_signale) ? s.pilote_signale[0] : s.pilote_signale,
          compagnie_signalee: Array.isArray(s.compagnie_signalee) ? s.compagnie_signalee[0] : s.compagnie_signalee,
          traite_par: Array.isArray(s.traite_par) ? s.traite_par[0] : s.traite_par
        }))}
        enquetes={(enquetes || []).map(e => ({
          ...e,
          pilote_concerne: Array.isArray(e.pilote_concerne) ? e.pilote_concerne[0] : e.pilote_concerne,
          compagnie_concernee: Array.isArray(e.compagnie_concernee) ? e.compagnie_concernee[0] : e.compagnie_concernee,
          enqueteur: Array.isArray(e.enqueteur) ? e.enqueteur[0] : e.enqueteur,
          ouvert_par: Array.isArray(e.ouvert_par) ? e.ouvert_par[0] : e.ouvert_par
        }))}
        sanctions={(sanctions || []).map(s => ({
          ...s,
          cible_pilote: Array.isArray(s.cible_pilote) ? s.cible_pilote[0] : s.cible_pilote,
          cible_compagnie: Array.isArray(s.cible_compagnie) ? s.cible_compagnie[0] : s.cible_compagnie,
          emis_par: Array.isArray(s.emis_par) ? s.emis_par[0] : s.emis_par,
          cleared_by: Array.isArray(s.cleared_by) ? s.cleared_by[0] : s.cleared_by
        }))}
        pilotes={pilotes || []}
        compagnies={compagnies || []}
        agentsIfsa={agentsIfsa || []}
      />
    </div>
  );
}
