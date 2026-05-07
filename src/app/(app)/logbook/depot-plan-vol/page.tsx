import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plane, Radio, Compass, Navigation2 } from 'lucide-react';
import DepotPlanVolForm from './DepotPlanVolForm';

export default async function DepotPlanVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/logbook');

  // Vérifier si le pilote a déjà un plan actif (accepté, en cours, etc.)
  // Inclure 'en_pause' et 'planifie_suivant' pour bloquer la création d'un autre plan
  // pendant qu'une mission MEDEVAC multi-segments est en cours.
  const { data: planActif } = await supabase
    .from('plans_vol')
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, statut')
    .eq('pilote_id', user.id)
    .in('statut', ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'en_pause', 'planifie_suivant'])
    .limit(1)
    .maybeSingle();

  // Si un plan est actif, rediriger vers la page des plans avec message
  if (planActif) {
    redirect('/logbook/plans-vol?active=true');
  }

  const admin = createAdminClient();

  // Récupérer TOUTES les compagnies où le pilote est employé
  const { data: emplois } = await admin.from('compagnie_employes')
    .select('compagnie_id, compagnies(id, nom, prix_billet_pax, prix_kg_cargo, pourcentage_salaire, code_oaci)')
    .eq('pilote_id', user.id);

  // Récupérer TOUTES les compagnies où le pilote est PDG
  const { data: compagniesPdg } = await admin.from('compagnies')
    .select('id, nom, prix_billet_pax, prix_kg_cargo, pourcentage_salaire, code_oaci')
    .eq('pdg_id', user.id);

  // Construire la liste de toutes les compagnies disponibles (employé + PDG)
  type CompagnieOption = { id: string; nom: string; prix_billet_pax: number; prix_kg_cargo: number; pourcentage_salaire: number; code_oaci: string | null; role: 'employe' | 'pdg' };
  const compagniesMap = new Map<string, CompagnieOption>();

  // Ajouter les compagnies où il est employé
  (emplois || []).forEach(e => {
    const c = e.compagnies;
    const cObj = c ? (Array.isArray(c) ? c[0] : c) as { id: string; nom: string; prix_billet_pax: number; prix_kg_cargo: number; pourcentage_salaire: number; code_oaci: string | null } : null;
    if (cObj && !compagniesMap.has(cObj.id)) {
      compagniesMap.set(cObj.id, { ...cObj, role: 'employe' });
    }
  });

  // Ajouter les compagnies où il est PDG (priorité sur employé)
  (compagniesPdg || []).forEach(c => {
    compagniesMap.set(c.id, { ...c, role: 'pdg' });
  });

  const compagniesDisponibles = Array.from(compagniesMap.values());

  // Récupérer l'inventaire personnel
  const { data: inventaireData } = await admin.from('inventaire_avions')
    .select('*, types_avion:type_avion_id(id, nom, code_oaci, capacite_pax, capacite_cargo_kg, est_militaire)')
    .eq('proprietaire_id', user.id);

  // Vérifier disponibilité
  const inventairePersonnel = await Promise.all((inventaireData || []).map(async (item) => {
    const { count } = await admin.from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('inventaire_avion_id', item.id)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);
    
    return {
      ...item,
      disponible: (count || 0) === 0
    };
  }));

  // Récupérer les avions individuels de toutes les compagnies
  type AvionIndividuel = {
    id: string;
    compagnie_id: string;
    immatriculation: string;
    nom_bapteme: string | null;
    aeroport_actuel: string;
    statut: string;
    usure_percent: number;
    types_avion: { id: string; nom: string; constructeur: string; capacite_pax: number; capacite_cargo_kg: number; code_oaci: string | null } | { id: string; nom: string; constructeur: string; capacite_pax: number; capacite_cargo_kg: number; code_oaci: string | null }[] | null;
  };
  let avionsParCompagnie: Record<string, AvionIndividuel[]> = {};

  if (compagniesDisponibles.length > 0) {
    const compagnieIds = compagniesDisponibles.map(c => c.id);
    const { data: avionsData } = await admin.from('compagnie_avions')
      .select('id, compagnie_id, immatriculation, nom_bapteme, aeroport_actuel, statut, usure_percent, types_avion:type_avion_id(id, nom, constructeur, capacite_pax, capacite_cargo_kg, code_oaci)')
      .in('compagnie_id', compagnieIds)
      .order('immatriculation');

    const nowIso = new Date().toISOString();
    const { data: locationsActives } = await admin.from('compagnie_locations')
      .select('avion_id, loueur_compagnie_id, locataire_compagnie_id, start_at, end_at, statut')
      .in('locataire_compagnie_id', compagnieIds)
      .eq('statut', 'active')
      .lte('start_at', nowIso)
      .gte('end_at', nowIso);

    const leasedOutIds = new Set((locationsActives || []).map(l => l.avion_id));

    // Grouper par compagnie
    (avionsData || []).forEach(item => {
      // Si avion loué à une autre compagnie, ne pas l'afficher pour le propriétaire
      if (leasedOutIds.has(item.id)) {
        return;
      }
      if (!avionsParCompagnie[item.compagnie_id]) {
        avionsParCompagnie[item.compagnie_id] = [];
      }
      avionsParCompagnie[item.compagnie_id].push(item as AvionIndividuel);
    });

    // Ajouter les avions loués aux compagnies locataires
    if (locationsActives && locationsActives.length > 0) {
      const leasedIds = Array.from(new Set(locationsActives.map(l => l.avion_id)));
      const { data: leasedAvions } = await admin.from('compagnie_avions')
        .select('id, compagnie_id, immatriculation, nom_bapteme, aeroport_actuel, statut, usure_percent, types_avion:type_avion_id(id, nom, constructeur, capacite_pax, capacite_cargo_kg, code_oaci)')
        .in('id', leasedIds);

      (leasedAvions || []).forEach(item => {
        const loc = locationsActives.find(l => l.avion_id === item.id);
        if (!loc) return;
        const locataireId = loc.locataire_compagnie_id;
        if (!avionsParCompagnie[locataireId]) {
          avionsParCompagnie[locataireId] = [];
        }
        avionsParCompagnie[locataireId].push(item as AvionIndividuel);
      });
    }
  }

  const nowUtc = new Date().toUTCString().slice(17, 22); // "HH:MM"

  return (
    <div className="space-y-6 animate-page-reveal">
      {/* ===== HUD Header — bandeau aviation ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-950/95 shadow-[0_22px_42px_rgba(2,6,23,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
        {/* Grille cockpit en fond */}
        <div className="pointer-events-none absolute inset-0 bg-cockpit-grid opacity-60" />
        {/* Halo radar */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
        {/* Avion qui glisse en arrière-plan */}
        <Plane
          className="pointer-events-none absolute top-3 -left-10 h-5 w-5 text-sky-400/40 animate-plane-glide"
          style={{ animationDuration: '7s' }}
          aria-hidden
        />

        <div className="relative flex flex-col gap-4 p-5 sm:p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Link
              href="/logbook"
              className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800/60 text-slate-300 transition-all hover:-translate-x-0.5 hover:border-sky-500/40 hover:bg-slate-700/70 hover:text-sky-300"
              aria-label="Retour au logbook"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-400/80">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-hud-blink" />
                FLIGHT PLAN · DEPOSIT
              </div>
              <h1 className="flex items-center gap-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-50">
                <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-indigo-500/20 border border-sky-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                  <Plane className="h-5 w-5 text-sky-300 -rotate-12" />
                </span>
                <span className="bg-gradient-to-r from-slate-50 via-sky-100 to-indigo-200 bg-clip-text text-transparent">
                  Déposer un plan de vol
                </span>
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Renseignez votre route, votre appareil et soumettez votre plan à l&apos;ATC.
              </p>
            </div>
          </div>

          {/* Mini panneau d'instruments (HUD) */}
          <div className="hidden lg:flex items-stretch gap-2 text-xs">
            <div className="flex flex-col items-start rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 backdrop-blur-md">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">UTC</span>
              <span className="font-mono text-base font-semibold text-sky-300">{nowUtc}z</span>
            </div>
            <div className="flex flex-col items-start rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 backdrop-blur-md">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Status</span>
              <span className="flex items-center gap-1.5 font-mono text-sm font-semibold text-emerald-300">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                READY
              </span>
            </div>
            <div className="flex flex-col items-start rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 backdrop-blur-md">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Mode</span>
              <span className="flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-200">
                <Compass className="h-3.5 w-3.5 text-sky-400 animate-compass-spin" />
                FILE
              </span>
            </div>
          </div>
        </div>

        {/* Ligne d'horizon décorative en bas */}
        <div className="relative h-[3px] w-full overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent translate-x-[-50%] animate-shimmer" />
        </div>
      </div>

      {/* Mini stats inline mobile (alternative aux instruments) */}
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Navigation2 className="h-4 w-4 text-sky-400 animate-compass-spin" />
          <span className="font-mono uppercase tracking-wider">Préparation du briefing</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-emerald-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Ready
        </span>
      </div>

      <DepotPlanVolForm 
        compagniesDisponibles={compagniesDisponibles}
        inventairePersonnel={inventairePersonnel}
        avionsParCompagnie={avionsParCompagnie}
      />
    </div>
  );
}
