import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Radio, Plane, Clock, MapPin, Flame } from 'lucide-react';
import CreateManualStripButton from '../CreateManualStripButton';
import SeMettreEnServiceForm from '../SeMettreEnServiceForm';
import HorsServiceButton from '../HorsServiceButton';
import PlansEnAttenteModal from '@/components/PlansEnAttenteModal';
import AtcEnLigneModal from '@/components/AtcEnLigneModal';
import FlightStripBoardWrapper from '@/components/FlightStripBoardWrapper';
import AtcNonControlesPanel from '@/components/AtcNonControlesPanel';
import AtcGestionParkingsPanel from '@/components/AtcGestionParkingsPanel';
import { getTypeWake } from '@/lib/wake-turbulence';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { StripData } from '@/components/FlightStrip';
import { loadAllAtcAccessRules, loadAtcAccessContext } from '@/lib/atc-grade-restrictions';


export default async function AtcPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const accessContext = await loadAtcAccessContext(admin, user.id);
  const { airportOptions } = await loadAllAtcAccessRules(admin);
  
  // D'abord récupérer la session pour l'utiliser dans les requêtes suivantes
  const { data: session } = await supabase.from('atc_sessions').select('id, aeroport, position, started_at').eq('user_id', user.id).single();
  
  const [{ data: plansChezMoiRaw }, { data: sessionsEnService }, { data: plansEnAttente }, { data: afisEnService }, { data: dataAuto }, { data: dataOrphelinsRaw }, { data: sessionsActiveRaw }] = await Promise.all([
    admin.from('plans_vol').select('*').eq('current_holder_user_id', user.id).or('automonitoring.eq.false,automonitoring.is.null').is('pending_transfer_aeroport', null).in('statut', ['en_cours', 'accepte', 'en_attente_cloture', 'depose', 'en_attente']).order('created_at', { ascending: false }),
    admin.from('atc_sessions').select('aeroport, position, user_id, profiles!atc_sessions_user_id_fkey(identifiant)').order('aeroport').order('position'),
    admin.from('plans_vol').select('id').in('statut', ['depose', 'en_attente']),
    admin.from('afis_sessions').select('aeroport, est_afis, user_id, profiles!afis_sessions_user_id_fkey(identifiant)').order('aeroport'),
    session ? admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee').eq('automonitoring', true).in('statut', ['accepte', 'en_cours']) : Promise.resolve({ data: [] }),
    session ? admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee, current_holder_user_id').in('statut', ['depose', 'en_attente']) : Promise.resolve({ data: [] }),
    session ? admin.from('atc_sessions').select('user_id') : Promise.resolve({ data: [] }),
  ]);

  const plansAuto = (dataAuto ?? []) as { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string }[];
  const sessionsActivesSet = new Set(((sessionsActiveRaw ?? []) as { user_id: string }[]).map((s) => s.user_id));
  const plansOrphelins = ((dataOrphelinsRaw ?? []) as { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string; current_holder_user_id: string | null }[])
    .filter((p) => !p.current_holder_user_id || !sessionsActivesSet.has(p.current_holder_user_id))
    .map((p) => ({ id: p.id, numero_vol: p.numero_vol, aeroport_depart: p.aeroport_depart, aeroport_arrivee: p.aeroport_arrivee }));

  // Enrichir les plans — batch queries pour éviter N+1 (6 requêtes totales au lieu de N×4-6)
  const rawPlans = plansChezMoiRaw || [];

  // Collecter tous les IDs uniques pour les jointures
  const compagnieAvionIds = [...new Set(rawPlans.map(p => p.compagnie_avion_id).filter((id): id is string => Boolean(id)))];
  const inventaireAvionIds = [...new Set(rawPlans.map(p => p.inventaire_avion_id).filter((id): id is string => Boolean(id)))];
  const siaviAvionIds = [...new Set(rawPlans.map(p => p.siavi_avion_id).filter((id): id is string => Boolean(id)))];
  const piloteIds = [...new Set(rawPlans.map(p => p.pilote_id).filter((id): id is string => Boolean(id)))];
  const compagnieIds = [...new Set(rawPlans.map(p => p.compagnie_id).filter((id): id is string => Boolean(id)))];

  type AvionRow = { id: string; immatriculation: string | null; type_avion_id: string | null };
  type PiloteRow = { id: string; identifiant: string | null };
  type CompagnieRow = { id: string; code_oaci: string | null; callsign_telephonie: string | null };

  // Batch 1 : 5 requêtes en parallèle
  const [compAvionsRes, invAvionsRes, siaviAvionsRes, pilotesRes, compagniesRes] = await Promise.all([
    compagnieAvionIds.length > 0
      ? admin.from('compagnie_avions').select('id, immatriculation, type_avion_id').in('id', compagnieAvionIds)
      : Promise.resolve({ data: [] as AvionRow[] }),
    inventaireAvionIds.length > 0
      ? admin.from('inventaire_avions').select('id, immatriculation, type_avion_id').in('id', inventaireAvionIds)
      : Promise.resolve({ data: [] as AvionRow[] }),
    siaviAvionIds.length > 0
      ? admin.from('siavi_avions').select('id, immatriculation, type_avion_id').in('id', siaviAvionIds)
      : Promise.resolve({ data: [] as AvionRow[] }),
    piloteIds.length > 0
      ? admin.from('profiles').select('id, identifiant').in('id', piloteIds)
      : Promise.resolve({ data: [] as PiloteRow[] }),
    compagnieIds.length > 0
      ? admin.from('compagnies').select('id, code_oaci, callsign_telephonie').in('id', compagnieIds)
      : Promise.resolve({ data: [] as CompagnieRow[] }),
  ]);

  const compAvionById = new Map((compAvionsRes.data ?? []).map(a => [a.id, a]));
  const invAvionById = new Map((invAvionsRes.data ?? []).map(a => [a.id, a]));
  const siaviAvionById = new Map((siaviAvionsRes.data ?? []).map(a => [a.id, a]));
  const piloteById = new Map((pilotesRes.data ?? []).map(p => [p.id, p]));
  const compagnieById = new Map((compagniesRes.data ?? []).map(c => [c.id, c]));

  // Déterminer tous les type_avion_id effectifs (cascade compagnie > inventaire > siavi par plan)
  const typeAvionIdSet = new Set<string>();
  for (const plan of rawPlans) {
    const compAvion = plan.compagnie_avion_id ? compAvionById.get(plan.compagnie_avion_id) : undefined;
    const invAvion = (!compAvion?.type_avion_id && plan.inventaire_avion_id)
      ? invAvionById.get(plan.inventaire_avion_id) : undefined;
    const siaviAvion = (!compAvion?.type_avion_id && !invAvion?.type_avion_id && plan.siavi_avion_id)
      ? siaviAvionById.get(plan.siavi_avion_id) : undefined;
    const typeId = compAvion?.type_avion_id ?? invAvion?.type_avion_id ?? siaviAvion?.type_avion_id;
    if (typeId) typeAvionIdSet.add(typeId);
  }

  // Batch 2 : types_avion (1 seule requête)
  type TypeAvionRow = { id: string; nom: string | null; code_oaci: string | null };
  const typeAvionIdList = [...typeAvionIdSet];
  const { data: typesAvionData } = typeAvionIdList.length > 0
    ? await admin.from('types_avion').select('id, nom, code_oaci').in('id', typeAvionIdList)
    : { data: [] as TypeAvionRow[] };
  const typeAvionById = new Map((typesAvionData ?? []).map(t => [t.id, t]));

  // Enrichissement synchrone en O(1) — plus aucune requête DB
  const plansChezMoi: StripData[] = rawPlans.map(plan => {
    let immatriculation: string | null = null;
    let typeAvionCodeOaci: string | null = null;
    let typeAvionNom: string | null = null;
    let piloteIdentifiant: string | null = null;
    let callsignTelephonie: string | null = null;

    // Cascade avion : compagnie → inventaire → siavi
    const compAvion = plan.compagnie_avion_id ? compAvionById.get(plan.compagnie_avion_id) : undefined;
    if (compAvion) {
      immatriculation = compAvion.immatriculation ?? null;
    }

    const invAvion = (!compAvion?.type_avion_id && plan.inventaire_avion_id)
      ? invAvionById.get(plan.inventaire_avion_id) : undefined;
    if (invAvion) {
      if (!immatriculation) immatriculation = invAvion.immatriculation ?? null;
    }

    const siaviAvion = (!compAvion?.type_avion_id && !invAvion?.type_avion_id && plan.siavi_avion_id)
      ? siaviAvionById.get(plan.siavi_avion_id) : undefined;
    if (siaviAvion) {
      if (!immatriculation) immatriculation = siaviAvion.immatriculation ?? null;
    }

    const typeAvionId = compAvion?.type_avion_id ?? invAvion?.type_avion_id ?? siaviAvion?.type_avion_id ?? null;
    if (typeAvionId) {
      const typeData = typeAvionById.get(typeAvionId);
      if (typeData) {
        typeAvionCodeOaci = typeData.code_oaci ?? null;
        typeAvionNom = typeData.nom ?? null;
      }
    }

    // Dernier filet : si l'ATC a saisi manuellement strip_type_wake (ex: "B738/M"),
    // on en extrait le code OACI pour que la cellule TYPE/W ne reste pas "?/?"
    if (!typeAvionCodeOaci && plan.strip_type_wake) {
      const code = String(plan.strip_type_wake).split('/')[0]?.trim();
      if (code) typeAvionCodeOaci = code.toUpperCase();
    }

    if (plan.pilote_id) {
      const piloteData = piloteById.get(plan.pilote_id);
      if (piloteData) piloteIdentifiant = piloteData.identifiant ?? null;
    }

    if (plan.compagnie_id) {
      const compData = compagnieById.get(plan.compagnie_id);
      if (compData?.callsign_telephonie && compData?.code_oaci) {
        const nv = (plan.numero_vol || '').toUpperCase();
        if (nv.startsWith(compData.code_oaci.toUpperCase())) {
          callsignTelephonie = compData.callsign_telephonie;
        }
      }
    }

    return {
      id: plan.id,
      numero_vol: plan.numero_vol || '',
      aeroport_depart: plan.aeroport_depart || '',
      aeroport_arrivee: plan.aeroport_arrivee || '',
      type_vol: plan.type_vol || '',
      statut: plan.statut || '',
      created_at: plan.created_at || '',
      accepted_at: plan.accepted_at || null,
      immatriculation,
      type_avion_code_oaci: typeAvionCodeOaci,
      type_avion_nom: typeAvionNom,
      type_wake: getTypeWake(typeAvionCodeOaci),
      code_transpondeur: plan.code_transpondeur || null,
      mode_transpondeur: plan.mode_transpondeur || 'C',
      squawk_attendu: null,
      sid_depart: plan.sid_depart || null,
      star_arrivee: plan.star_arrivee || null,
      route_ifr: plan.route_ifr || null,
      strip_atd: plan.strip_atd || null,
      strip_rwy: plan.strip_rwy || null,
      strip_fl: plan.strip_fl || null,
      strip_fl_unit: plan.strip_fl_unit || null,
      strip_sid_atc: plan.strip_sid_atc || null,
      strip_note_1: plan.strip_note_1 || null,
      strip_note_2: plan.strip_note_2 || null,
      strip_note_3: plan.strip_note_3 || null,
      strip_star: plan.strip_star || null,
      strip_route: plan.strip_route || null,
      strip_pilote_text: plan.strip_pilote_text || null,
      strip_type_wake: plan.strip_type_wake || null,
      strip_zone: plan.strip_zone || null,
      strip_order: plan.strip_order ?? 0,
      pilote_identifiant: piloteIdentifiant,
      intentions_vol: plan.intentions_vol || null,
      niveau_croisiere: plan.niveau_croisiere || null,
      heure_depart_estimee: plan.heure_depart_estimee || null,
      instructions_atc: plan.note_atc || null,
      automonitoring: plan.automonitoring ?? false,
      isManual: !plan.pilote_id && Boolean(plan.created_by_atc),
      callsign_telephonie: callsignTelephonie,
      bria_conversation: plan.bria_conversation || null,
      current_holder_user_id: plan.current_holder_user_id || null,
    } as StripData;
  });

  // Les sessions sont déjà enrichies avec les JOIN dans la requête ci-dessus
  // Fallback pour éviter les erreurs TypeScript
  const sessionsEnServiceSafe = sessionsEnService ?? [];
  const afisEnServiceSafe = afisEnService ?? [];

  // Récupérer TOUTES les fréquences VHF pour affichage dans la liste des positions
  const { data: allVhfFreqs } = await admin
    .from('vhf_position_frequencies')
    .select('aeroport, position, frequency');
  const vhfFreqMap = new Map<string, string>();
  (allVhfFreqs || []).forEach(f => {
    vhfFreqMap.set(`${f.aeroport}-${f.position}`, f.frequency);
  });

  // Grouper les sessions par aéroport
  const byAeroport = sessionsEnServiceSafe.reduce<Record<string, Array<{ position: string; identifiant: string }>>>((acc, s) => {
    const k = s.aeroport;
    if (!acc[k]) acc[k] = [];
    const profileData = s.profiles;
    const profile = profileData ? (Array.isArray(profileData) ? profileData[0] : profileData) : null;
    const identifiant = (profile as { identifiant: string } | null)?.identifiant || '—';
    acc[k].push({ position: s.position, identifiant });
    return acc;
  }, {});

  const totalAtcEnService = sessionsEnService?.length || 0;
  const totalPlansEnAttente = plansEnAttente?.length || 0;
  const networkPanel = (
    <section className="rounded-xl border border-slate-700/40 bg-slate-950/30 overflow-hidden shrink-0">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-700/40">
        <MapPin className="h-3.5 w-3.5 text-sky-400" />
        <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-300">Réseau en ligne</h2>
        <span className="ml-auto text-[11px] font-bold tabular-nums text-slate-500">{totalAtcEnService} ATC</span>
      </div>
      {Object.keys(byAeroport).length === 0 && afisEnServiceSafe.length === 0 ? (
        <p className="px-3 py-4 text-xs text-slate-500 italic">Aucune position en service</p>
      ) : (
        <div className="p-2 flex gap-2 overflow-x-auto">
          {Object.entries(byAeroport).map(([apt, controllers]) => (
            <div key={`atc-${apt}`} className="min-w-[160px] rounded-lg border border-emerald-800/40 bg-emerald-950/30 px-2.5 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-black font-mono text-emerald-300">{apt}</span>
              </div>
              <div className="space-y-1">
                {controllers.map((c, idx) => {
                  const freq = vhfFreqMap.get(`${apt}-${c.position}`);
                  return (
                    <div key={`${apt}-${c.position}-${idx}`} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-emerald-200/80">{c.position}</span>
                      {freq && <span className="font-mono text-emerald-400/70">{freq}</span>}
                      <span className="text-slate-500 ml-auto truncate">{c.identifiant}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {afisEnServiceSafe.map((sess, idx) => (
            <div
              key={`afis-${sess.aeroport}-${idx}`}
              className={`min-w-[160px] rounded-lg border px-2.5 py-2 ${sess.est_afis ? 'border-red-800/40 bg-red-950/30' : 'border-amber-800/40 bg-amber-950/30'}`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Flame className={`h-3.5 w-3.5 ${sess.est_afis ? 'text-red-400' : 'text-amber-400'}`} />
                <span className={`text-sm font-black font-mono ${sess.est_afis ? 'text-red-300' : 'text-amber-300'}`}>{sess.aeroport}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] gap-2">
                <span className={sess.est_afis ? 'text-red-300/80' : 'text-amber-300/80'}>{sess.est_afis ? 'AFIS' : 'Pompier'}</span>
                {sess.est_afis && vhfFreqMap.get(`${sess.aeroport}-AFIS`) && (
                  <span className="font-mono text-red-400/70">{vhfFreqMap.get(`${sess.aeroport}-AFIS`)}</span>
                )}
                <span className="text-slate-500 ml-auto truncate">
                  {(sess.profiles as { identifiant?: string } | null)?.identifiant || '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  if (!session) {
    return (
      <div className="flex-1 min-h-0 overflow-auto space-y-4 pb-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.7fr)] items-start">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-950/40 p-5 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/25">
                <Radio className="h-5 w-5 text-amber-300" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400/80">Hors service</p>
                <h1 className="text-xl font-black text-slate-50">Prise de position</h1>
              </div>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              Choisissez un aéroport et une position pour ouvrir la console strips.
            </p>
            <SeMettreEnServiceForm accessContext={accessContext} airportOptions={airportOptions} />
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-700/50 bg-slate-950/40 p-4 flex gap-3">
              <AtcEnLigneModal
                totalAtc={totalAtcEnService}
                sessionsEnService={sessionsEnServiceSafe.map((s) => ({
                  aeroport: s.aeroport,
                  position: s.position,
                  user_id: s.user_id,
                  identifiant: (s.profiles as { identifiant?: string } | null)?.identifiant || '—',
                }))}
              />
              <PlansEnAttenteModal totalPlans={totalPlansEnAttente} />
            </div>
            {networkPanel}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="atc-console">
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Console</span>
          <span className="font-mono font-black text-emerald-300">{session.aeroport}</span>
          <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">{session.position}</span>
          <span className="hidden sm:inline-flex text-[11px] text-slate-500 items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(session.started_at), { locale: fr })}
          </span>
          {(plansChezMoi?.length || 0) > 0 && (
            <span className="text-[11px] font-bold tabular-nums rounded-full bg-sky-950 text-sky-200 px-2 py-0.5">
              {plansChezMoi.length} vol{plansChezMoi.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <AtcEnLigneModal
          totalAtc={totalAtcEnService}
          sessionsEnService={sessionsEnServiceSafe.map((s) => ({
            aeroport: s.aeroport,
            position: s.position,
            user_id: s.user_id,
            identifiant: (s.profiles as { identifiant?: string } | null)?.identifiant || '—',
          }))}
        />
        <PlansEnAttenteModal totalPlans={totalPlansEnAttente} />
        <CreateManualStripButton />
        <HorsServiceButton />
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-2">
        {!plansChezMoi || plansChezMoi.length === 0 ? (
          <div className="flex-1 rounded-xl border border-dashed border-slate-600/60 bg-slate-950/20 flex flex-col items-center justify-center text-center px-6">
            <div className="h-12 w-12 rounded-xl bg-slate-800/70 border border-slate-700 flex items-center justify-center mb-3">
              <Plane className="h-6 w-6 text-slate-500" />
            </div>
            <p className="text-slate-300 font-semibold">Aucun strip sous contrôle</p>
            <p className="text-slate-500 text-sm mt-1">Les nouveaux plans arrivent dans l&apos;inbox à droite, ou créez un strip manuel.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <FlightStripBoardWrapper
              allStrips={plansChezMoi}
              plansATraiter={plansChezMoi.filter((s) => ['depose', 'en_attente'].includes(s.statut)).map((s) => s.id)}
              atcPosition={session.position}
              atcAeroport={session.aeroport}
              onlineSessions={sessionsEnServiceSafe.map((s) => ({ aeroport: s.aeroport, position: s.position, user_id: s.user_id }))}
            />
          </div>
        )}

        <AtcNonControlesPanel
          plansAuto={plansAuto}
          plansOrphelins={plansOrphelins}
          sessionAeroport={session.aeroport}
          sessionPosition={session.position}
        />
        {networkPanel}
      </div>

      <AtcGestionParkingsPanel aeroport={session.aeroport} />
    </div>
  );
}

