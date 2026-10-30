import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plane, Clock3, FileCheck2 } from 'lucide-react';
import styles from '../plans-vol/PilotOperations.module.css';
import DepotPlanVolForm, { type AvionArmeeItem } from './DepotPlanVolForm';
import { filterStudentInventory } from '@/lib/instruction-fictive-aircraft';

export default async function DepotPlanVolPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<{ mission?: string; duplicate?: string; reservation?: string; itinerary?: string }> }) {
  const searchParams = await searchParamsPromise;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role, armee').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/logbook');

  const itineraryId = searchParams?.itinerary || '';
  const missionId = itineraryId ? '' : searchParams?.mission || '';
  const { data: initialDraft } = !itineraryId && searchParams?.duplicate && /^[a-f0-9-]{36}$/i.test(searchParams.duplicate)
    ? await supabase.from('plans_vol').select('aeroport_depart,aeroport_arrivee,temps_prev_min,type_vol,route_ifr,niveau_croisiere,intentions_vol').eq('id',searchParams.duplicate).eq('pilote_id',user.id).maybeSingle()
    : { data: null };

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
  const { data: eventReservation } = !itineraryId && searchParams?.reservation && /^[a-f0-9-]{36}$/i.test(searchParams.reservation)
    ? await admin.from('event_reservations').select('id,event_id,departure,arrival,departure_at,duration_minutes,callsign,airline,aircraft')
      .eq('id',searchParams.reservation).eq('user_id',user.id).eq('role','pilot').eq('status','confirmed').is('claimed_at',null).maybeSingle()
    : { data: null };

  let armeeAvions: AvionArmeeItem[] = [];
  if (profile?.armee) {
    const { data: armeeRows } = await admin
      .from('armee_avions')
      .select('id, nom_personnalise, types_avion(id, nom, code_oaci, est_militaire, has_mode_s)')
      .order('created_at', { ascending: false });
    armeeAvions = (armeeRows || []) as AvionArmeeItem[];
  }

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
    .select('*, types_avion:type_avion_id(id, nom, code_oaci, capacite_pax, capacite_cargo_kg, est_militaire, has_mode_s)')
    .eq('proprietaire_id', user.id);

  const visibleInventaire = filterStudentInventory(inventaireData || []);

  // Vérifier disponibilité
  const inventairePersonnel = await Promise.all(visibleInventaire.map(async (item) => {
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
      .select('id, compagnie_id, immatriculation, nom_bapteme, aeroport_actuel, statut, usure_percent, types_avion:type_avion_id(id, nom, constructeur, capacite_pax, capacite_cargo_kg, code_oaci, has_mode_s)')
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
        .select('id, compagnie_id, immatriculation, nom_bapteme, aeroport_actuel, statut, usure_percent, types_avion:type_avion_id(id, nom, constructeur, capacite_pax, capacite_cargo_kg, code_oaci, has_mode_s)')
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


  return (
    <div className={`${styles.operations} mx-auto w-full max-w-5xl space-y-6`}>
      <header className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-5 sm:p-6">
        <Link href="/logbook/plans-vol" className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm text-slate-400 hover:text-slate-100">
          <ArrowLeft aria-hidden className="h-4 w-4" /> Mes plans de vol
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-sky-400">Opérations de vol · Préparation</p>
            <h1 id="flight-plan-title" className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl"><Plane aria-hidden className="h-6 w-6 text-sky-400" /> Déposer un plan de vol</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">Sélectionnez votre appareil et votre route, renseignez les informations opérationnelles, puis vérifiez le récapitulatif avant envoi.</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300"><Clock3 aria-hidden className="h-4 w-4 text-sky-400" /> Horaires en UTC <span className="font-mono tabular-nums">Zulu</span></div>
        </div>
        <p className="mt-4 flex items-start gap-2 border-t border-slate-800 pt-4 text-xs leading-relaxed text-slate-400"><FileCheck2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> Le dépôt d’un plan, la clôture du vol et son enregistrement au carnet sont trois étapes distinctes.</p>
      </header>

      <DepotPlanVolForm 
        initialReservation={eventReservation ?? undefined}
        draftKey={`flight-draft:${user.id}`}
        initialDraft={initialDraft ?? undefined}
        compagniesDisponibles={compagniesDisponibles}
        inventairePersonnel={inventairePersonnel}
        avionsParCompagnie={avionsParCompagnie}
        armeeAvions={armeeAvions}
        initialMissionId={missionId}
        initialItineraryId={itineraryId}
      />
    </div>
  );
}
