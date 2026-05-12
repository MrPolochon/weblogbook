import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Shield, FileSearch, AlertTriangle, Gavel, Users, ShieldCheck, Award, TrendingUp } from 'lucide-react';
import IfsaClient from './IfsaClient';

export default async function IfsaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles')
    .select('role, ifsa, identifiant')
    .eq('id', user.id)
    .single();

  if (!profile?.ifsa && profile?.role !== 'admin') {
    redirect('/logbook');
  }

  const admin = createAdminClient();

  const [
    { data: signalements },
    { data: enquetes },
    { data: sanctions },
    { data: pilotes },
    { data: compagnies },
    { data: employes },
    { data: agentsIfsa },
    { count: autorisationsEnAttenteCount },
  ] = await Promise.all([
    admin.from('ifsa_signalements')
      .select(`
        *,
        signale_par:profiles!signale_par_id(id, identifiant),
        pilote_signale:profiles!pilote_signale_id(id, identifiant),
        compagnie_signalee:compagnies!compagnie_signalee_id(id, nom),
        traite_par:profiles!traite_par_id(id, identifiant)
      `)
      .order('created_at', { ascending: false })
      .limit(50),

    admin.from('ifsa_enquetes')
      .select(`
        *,
        pilote_concerne:profiles!pilote_concerne_id(id, identifiant),
        compagnie_concernee:compagnies!compagnie_concernee_id(id, nom),
        enqueteur:profiles!enqueteur_id(id, identifiant),
        ouvert_par:profiles!ouvert_par_id(id, identifiant)
      `)
      .order('created_at', { ascending: false })
      .limit(50),

    admin.from('ifsa_sanctions')
      .select(`
        *,
        cible_pilote:profiles!cible_pilote_id(id, identifiant),
        cible_compagnie:compagnies!cible_compagnie_id(id, nom),
        emis_par:profiles!emis_par_id(id, identifiant),
        cleared_by:profiles!cleared_by_id(id, identifiant)
      `)
      .order('created_at', { ascending: false })
      .limit(50),

    admin.from('profiles')
      .select('id, identifiant, role')
      .order('identifiant'),

    admin.from('compagnies')
      .select('id, nom')
      .order('nom'),

    admin.from('compagnie_employes')
      .select('pilote_id, compagnie_id, profiles(id, identifiant, role), compagnies(id, nom)')
      .order('date_embauche', { ascending: false }),

    admin.from('profiles')
      .select('id, identifiant')
      .or('ifsa.eq.true,role.eq.admin')
      .order('identifiant'),

    admin.from('autorisations_exploitation')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'en_attente'),
  ]);

  const pilotesEnCompagnie = new Set((employes || []).map((e) => e.pilote_id));
  const pilotesChomage = (pilotes || [])
    .filter((p) => p.role !== 'admin')
    .filter((p) => !pilotesEnCompagnie.has(p.id));

  const compagniesMap = new Map((compagnies || []).map((c) => [c.id, { id: c.id, nom: c.nom, pilotes: [] as Array<{ id: string; identifiant: string; role: string | null }> }]));
  (employes || []).forEach((e) => {
    const compagnie = Array.isArray(e.compagnies) ? e.compagnies[0] : e.compagnies;
    const profile = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
    if (!compagnie || !profile) return;
    const entry = compagniesMap.get(compagnie.id) || { id: compagnie.id, nom: compagnie.nom, pilotes: [] as Array<{ id: string; identifiant: string; role: string | null }> };
    entry.pilotes.push({ id: profile.id, identifiant: profile.identifiant, role: profile.role });
    compagniesMap.set(compagnie.id, entry);
  });
  const compagniesAvecPilotes = Array.from(compagniesMap.values());

  const signalementsList = signalements || [];
  const enquetesList = enquetes || [];
  const sanctionsList = sanctions || [];
  const signalementsNouveaux = signalementsList.filter(s => s.statut === 'nouveau').length;
  const signalementsEnExamen = signalementsList.filter(s => s.statut === 'en_examen').length;
  const enquetesOuvertes = enquetesList.filter(e => e.statut === 'ouverte' || e.statut === 'en_cours').length;
  const sanctionsActives = sanctionsList.filter(s => s.actif).length;
  const amendesNonPayees = sanctionsList.filter(s => s.actif && s.type_sanction === 'amende' && !s.amende_payee).length;
  const autorisationsCount = autorisationsEnAttenteCount || 0;
  const totalAlerts = signalementsNouveaux + autorisationsCount + amendesNonPayees;

  const statCards = [
    {
      key: 'signalements',
      label: 'Nouveaux signalements',
      sublabel: signalementsEnExamen > 0 ? `${signalementsEnExamen} en examen` : 'Aucun en examen',
      value: signalementsNouveaux,
      icon: AlertTriangle,
      colorRing: 'from-blue-500/10 to-blue-600/5 border-blue-500/20',
      ringHover: 'hover:from-blue-500/20 hover:border-blue-400/40',
      labelColor: 'text-blue-300/90',
      valueColor: 'text-blue-300',
      iconColor: 'text-blue-400',
      pulse: signalementsNouveaux > 0,
    },
    {
      key: 'enquetes',
      label: 'Enquêtes ouvertes',
      sublabel: `${enquetesList.length} au total`,
      value: enquetesOuvertes,
      icon: FileSearch,
      colorRing: 'from-purple-500/10 to-purple-600/5 border-purple-500/20',
      ringHover: 'hover:from-purple-500/20 hover:border-purple-400/40',
      labelColor: 'text-purple-300/90',
      valueColor: 'text-purple-300',
      iconColor: 'text-purple-400',
      pulse: false,
    },
    {
      key: 'sanctions',
      label: 'Sanctions actives',
      sublabel: amendesNonPayees > 0 ? `${amendesNonPayees} amende(s) impayée(s)` : 'Aucune amende impayée',
      value: sanctionsActives,
      icon: Gavel,
      colorRing: 'from-red-500/10 to-red-600/5 border-red-500/20',
      ringHover: 'hover:from-red-500/20 hover:border-red-400/40',
      labelColor: 'text-red-300/90',
      valueColor: 'text-red-300',
      iconColor: 'text-red-400',
      pulse: amendesNonPayees > 0,
    },
    {
      key: 'autorisations',
      label: 'Autorisations en attente',
      sublabel: autorisationsCount > 0 ? 'À traiter' : 'Tout est à jour',
      value: autorisationsCount,
      icon: ShieldCheck,
      colorRing: autorisationsCount > 0
        ? 'from-amber-500/10 to-amber-600/5 border-amber-500/20'
        : 'from-sky-500/10 to-sky-600/5 border-sky-500/20',
      ringHover: autorisationsCount > 0
        ? 'hover:from-amber-500/20 hover:border-amber-400/40'
        : 'hover:from-sky-500/20 hover:border-sky-400/40',
      labelColor: autorisationsCount > 0 ? 'text-amber-300/90' : 'text-sky-300/90',
      valueColor: autorisationsCount > 0 ? 'text-amber-300' : 'text-sky-300',
      iconColor: autorisationsCount > 0 ? 'text-amber-400' : 'text-sky-400',
      pulse: autorisationsCount > 0,
    },
    {
      key: 'agents',
      label: 'Agents IFSA',
      sublabel: 'Personnel actif',
      value: (agentsIfsa || []).length,
      icon: Users,
      colorRing: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20',
      ringHover: 'hover:from-emerald-500/20 hover:border-emerald-400/40',
      labelColor: 'text-emerald-300/90',
      valueColor: 'text-emerald-300',
      iconColor: 'text-emerald-400',
      pulse: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header avec radar sweep et halo pulsant */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-700 via-indigo-800 to-purple-900 p-6 sm:p-8 shadow-2xl border border-indigo-400/20 animate-reveal-blur">
        <div className="absolute inset-0 bg-cockpit-grid opacity-40 pointer-events-none"></div>

        {/* Radar sweep en arrière-plan */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full overflow-hidden opacity-50"
        >
          <div
            className="absolute inset-0 animate-radar-sweep"
            style={{
              background:
                'conic-gradient(from 0deg, rgba(56,189,248,0) 0deg, rgba(56,189,248,0.35) 50deg, rgba(56,189,248,0) 70deg)',
            }}
          />
        </div>

        {/* Petit avion qui glisse */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-3 left-0 right-0 h-6 overflow-hidden opacity-30"
        >
          <div className="animate-plane-glide text-white/60 text-xs">✈</div>
        </div>

        <div className="relative flex items-center gap-5 flex-wrap">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-sky-400/30 blur-xl animate-halo-pulse" aria-hidden></div>
            <div className="relative p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-glow">
              <Shield className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                IFSA
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-xs font-medium text-indigo-100 backdrop-blur">
                International Flight Safety Authority
              </span>
              {totalAlerts > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-500/30 border border-red-400/40 text-xs font-bold text-red-100 flex items-center gap-1.5 animate-pulse-soft">
                  <span className="status-dot status-dot-danger animate-blink-fast"></span>
                  {totalAlerts} alerte{totalAlerts > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-indigo-100/80 text-sm mt-1.5 max-w-xl">
              Centre de commandement de la sûreté aérienne — signalements, enquêtes, sanctions et autorisations.
            </p>
            <p className="text-indigo-200/60 text-xs mt-2 flex items-center gap-2">
              <span className="status-dot status-dot-success animate-hud-blink"></span>
              Connecté en tant qu&apos;agent <span className="font-semibold text-white">{profile?.identifiant || 'IFSA'}</span>
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end text-right">
            <div className="text-xs uppercase tracking-widest text-indigo-200/60">Cas actifs</div>
            <div className="text-3xl font-bold text-white tabular-nums">
              {signalementsNouveaux + enquetesOuvertes + sanctionsActives}
            </div>
            <div className="text-xs text-indigo-200/60 flex items-center gap-1.5 mt-0.5">
              <TrendingUp className="h-3.5 w-3.5" />
              tous dossiers confondus
            </div>
          </div>
        </div>
      </div>

      {/* Statistiques avec stagger animation */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 stagger-enter">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${s.colorRing} ${s.ringHover} border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg`}
            >
              {s.pulse && (
                <span aria-hidden className={`pointer-events-none absolute -top-1 -right-1 inline-flex h-3 w-3`}>
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-current"></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${s.iconColor}`}>
                    <span className="absolute inset-0 rounded-full bg-current"></span>
                  </span>
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`${s.labelColor} text-xs font-medium uppercase tracking-wider truncate`}>{s.label}</p>
                  <p className={`text-2xl sm:text-3xl font-bold ${s.valueColor} tabular-nums mt-1 animate-ticker-pop`}>
                    {s.value}
                  </p>
                </div>
                <Icon className={`h-8 w-8 ${s.iconColor} opacity-30 group-hover:opacity-60 group-hover:scale-110 transition-all duration-300`} />
              </div>
              <p className="text-[11px] text-slate-400/80 mt-1 truncate">{s.sublabel}</p>
            </div>
          );
        })}
        <Link
          href="/ifsa/licences"
          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:from-amber-500/20 hover:border-amber-400/40"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-amber-300/90 text-xs font-medium uppercase tracking-wider truncate">Licences</p>
              <p className="text-sm font-semibold text-amber-300 mt-1 truncate">Gérer les qualifications</p>
            </div>
            <Award className="h-8 w-8 text-amber-400 opacity-30 group-hover:opacity-60 group-hover:rotate-12 transition-all duration-300" />
          </div>
          <p className="text-[11px] text-slate-400/80 mt-1 truncate">Délivrer / révoquer</p>
        </Link>
      </div>

      <IfsaClient
        signalements={signalementsList.map(s => ({
          ...s,
          signale_par: Array.isArray(s.signale_par) ? s.signale_par[0] : s.signale_par,
          pilote_signale: Array.isArray(s.pilote_signale) ? s.pilote_signale[0] : s.pilote_signale,
          compagnie_signalee: Array.isArray(s.compagnie_signalee) ? s.compagnie_signalee[0] : s.compagnie_signalee,
          traite_par: Array.isArray(s.traite_par) ? s.traite_par[0] : s.traite_par
        }))}
        enquetes={enquetesList.map(e => ({
          ...e,
          pilote_concerne: Array.isArray(e.pilote_concerne) ? e.pilote_concerne[0] : e.pilote_concerne,
          compagnie_concernee: Array.isArray(e.compagnie_concernee) ? e.compagnie_concernee[0] : e.compagnie_concernee,
          enqueteur: Array.isArray(e.enqueteur) ? e.enqueteur[0] : e.enqueteur,
          ouvert_par: Array.isArray(e.ouvert_par) ? e.ouvert_par[0] : e.ouvert_par
        }))}
        sanctions={sanctionsList.map(s => ({
          ...s,
          cible_pilote: Array.isArray(s.cible_pilote) ? s.cible_pilote[0] : s.cible_pilote,
          cible_compagnie: Array.isArray(s.cible_compagnie) ? s.cible_compagnie[0] : s.cible_compagnie,
          emis_par: Array.isArray(s.emis_par) ? s.emis_par[0] : s.emis_par,
          cleared_by: Array.isArray(s.cleared_by) ? s.cleared_by[0] : s.cleared_by
        }))}
        pilotes={pilotes || []}
        compagnies={compagnies || []}
        compagniesAvecPilotes={compagniesAvecPilotes}
        pilotesChomage={pilotesChomage}
        agentsIfsa={agentsIfsa || []}
      />
    </div>
  );
}
