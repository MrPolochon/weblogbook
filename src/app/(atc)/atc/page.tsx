import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { Radio, Plane, Clock, MapPin, AlertTriangle, Activity, Flame } from 'lucide-react';
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


export default async function AtcPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  
  // D'abord récupérer la session pour l'utiliser dans les requêtes suivantes
  const { data: session } = await supabase.from('atc_sessions').select('id, aeroport, position, started_at').eq('user_id', user.id).single();
  
  const [{ data: plansChezMoiRaw }, { data: sessionsEnService }, { data: plansEnAttente }, { data: afisEnService }, { data: dataAuto }, { data: dataOrphelinsRaw }, { data: sessionsActiveRaw }] = await Promise.all([
    admin.from('plans_vol').select('*').eq('current_holder_user_id', user.id).is('pending_transfer_aeroport', null).in('statut', ['en_cours', 'accepte', 'en_attente_cloture', 'depose', 'en_attente']).order('created_at', { ascending: false }),
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

  // Enrichir les plans avec les données pilote, compagnie et avion (pour strips)
  const plansChezMoi: StripData[] = await Promise.all((plansChezMoiRaw || []).map(async (plan) => {
    let immatriculation: string | null = null;
    let typeAvionCodeOaci: string | null = null;
    let typeAvionNom: string | null = null;
    let piloteIdentifiant: string | null = null;
    let callsignTelephonie: string | null = null;

    let typeAvionId: string | null = null;

    if (plan.compagnie_avion_id) {
      const { data: avionData } = await admin.from('compagnie_avions')
        .select('immatriculation, type_avion_id')
        .eq('id', plan.compagnie_avion_id)
        .single();
      if (avionData) {
        immatriculation = avionData.immatriculation;
        typeAvionId = avionData.type_avion_id ?? null;
      }
    }

    // Fallback : avion personnel (inventaire pilote)
    if (!typeAvionId && plan.inventaire_avion_id) {
      const { data: invData } = await admin.from('inventaire_avions')
        .select('immatriculation, type_avion_id')
        .eq('id', plan.inventaire_avion_id)
        .single();
      if (invData) {
        if (!immatriculation) immatriculation = invData.immatriculation ?? null;
        typeAvionId = invData.type_avion_id ?? null;
      }
    }

    // Fallback : avion institutionnel SIAVI (MEDEVAC, etc.)
    if (!typeAvionId && plan.siavi_avion_id) {
      const { data: siaviData } = await admin.from('siavi_avions')
        .select('immatriculation, type_avion_id')
        .eq('id', plan.siavi_avion_id)
        .single();
      if (siaviData) {
        if (!immatriculation) immatriculation = siaviData.immatriculation ?? null;
        typeAvionId = siaviData.type_avion_id ?? null;
      }
    }

    if (typeAvionId) {
      const { data: typeData } = await admin.from('types_avion')
        .select('nom, code_oaci')
        .eq('id', typeAvionId)
        .single();
      if (typeData) {
        typeAvionCodeOaci = typeData.code_oaci;
        typeAvionNom = typeData.nom;
      }
    }

    // Dernier filet : si l'ATC a saisi manuellement strip_type_wake (ex: "B738/M"),
    // on en extrait le code OACI pour que la cellule TYPE/W ne reste pas "?/?"
    if (!typeAvionCodeOaci && plan.strip_type_wake) {
      const code = String(plan.strip_type_wake).split('/')[0]?.trim();
      if (code) typeAvionCodeOaci = code.toUpperCase();
    }

    if (plan.pilote_id) {
      const { data: piloteData } = await admin.from('profiles')
        .select('identifiant')
        .eq('id', plan.pilote_id)
        .single();
      if (piloteData) piloteIdentifiant = piloteData.identifiant;
    }

    // Récupérer le callsign téléphonie de la compagnie (seulement si le n° de vol utilise le code OACI)
    if (plan.compagnie_id) {
      const { data: compData } = await admin.from('compagnies')
        .select('code_oaci, callsign_telephonie')
        .eq('id', plan.compagnie_id)
        .single();
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
  }));

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-950/95 shadow-[0_22px_42px_rgba(2,6,23,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="pointer-events-none absolute inset-0 bg-cockpit-grid opacity-60" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4 p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20">
              <Radio className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Centre de contrôle</h1>
              <p className="text-sm text-slate-400 mt-0.5">Interface de contrôle aérien</p>
            </div>
          </div>
          <div className="flex gap-3">
            <AtcEnLigneModal
              totalAtc={totalAtcEnService}
              sessionsEnService={sessionsEnServiceSafe.map(s => ({
                aeroport: s.aeroport,
                position: s.position,
                user_id: s.user_id,
                identifiant: (s.profiles as { identifiant?: string } | null)?.identifiant || '—'
              }))}
            />
            <PlansEnAttenteModal totalPlans={totalPlansEnAttente} />
          </div>
        </div>
      </div>

      {/* Statut de service */}
      {!session ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 shrink-0">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-100 mb-1">Hors service</h2>
              <p className="text-slate-400 text-sm mb-4">
                Vous n&apos;êtes pas en service. Sélectionnez un aéroport et une position pour commencer à contrôler.
              </p>
              <SeMettreEnServiceForm />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <Radio className="h-6 w-6 text-emerald-400" />
                </div>
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-emerald-300 font-mono">{session.aeroport}</span>
                  <span className="text-slate-600">—</span>
                  <span className="text-lg font-semibold text-slate-200">{session.position}</span>
                </div>
                <p className="text-sm text-slate-400 flex items-center gap-1 mt-0.5">
                  <Clock className="h-3.5 w-3.5" />
                  En service depuis {formatDistanceToNow(new Date(session.started_at), { locale: fr })}
                </p>
              </div>
            </div>
            <HorsServiceButton />
          </div>
        </div>
      )}

      {/* Flight Strips Board */}
      {session && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-400" />
              Trafic sous contrôle
              {(plansChezMoi?.length || 0) > 0 && (
                <span className="text-xs font-medium text-slate-500 bg-slate-800/70 px-2 py-0.5 rounded-full">
                  {plansChezMoi.length}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-3">
              <CreateManualStripButton />
            </div>
          </div>

          {!plansChezMoi || plansChezMoi.length === 0 ? (
            <div className="card text-center py-10 border-slate-700/40">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-slate-800/60 border border-slate-700/60 mb-3 mx-auto">
                <Plane className="h-7 w-7 text-slate-500" />
              </div>
              <p className="text-slate-400 font-medium">Aucun plan de vol sous votre contrôle</p>
              <p className="text-slate-500 text-sm mt-1">Les nouveaux plans apparaîtront ici automatiquement</p>
            </div>
          ) : (
            <FlightStripBoardWrapper
              allStrips={plansChezMoi}
              plansATraiter={plansChezMoi.filter(s => ['depose', 'en_attente'].includes(s.statut)).map(s => s.id)}
              atcPosition={session.position}
              atcAeroport={session.aeroport}
              onlineSessions={sessionsEnServiceSafe.map(s => ({ aeroport: s.aeroport, position: s.position, user_id: s.user_id }))}
            />
          )}

          <div className="mt-3">
            <AtcNonControlesPanel
              plansAuto={plansAuto}
              plansOrphelins={plansOrphelins}
              sessionAeroport={session.aeroport}
              sessionPosition={session.position}
            />
          </div>
        </div>
      )}

      {/* Positions en service (ATC + AFIS) */}
      <div className="card border-slate-700/40">
        <h2 className="text-base font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-sky-400" />
          Positions en service
        </h2>

        {Object.keys(byAeroport).length === 0 && afisEnServiceSafe.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-slate-800/60 border border-slate-700/60 mb-3 mx-auto">
              <Radio className="h-6 w-6 text-slate-600" />
            </div>
            <p className="text-slate-500">Aucune position en service</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Contrôleurs ATC */}
            {Object.entries(byAeroport).map(([apt, controllers]) => (
              <div
                key={`atc-${apt}`}
                className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/35 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Radio className="h-4 w-4 text-emerald-400" />
                  <span className="text-base font-bold text-emerald-300 font-mono">{apt}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-auto" />
                </div>
                <div className="space-y-1.5">
                  {controllers.map((c, idx) => {
                    const freq = vhfFreqMap.get(`${apt}-${c.position}`);
                    return (
                      <div key={`${apt}-${c.position}-${idx}`} className="flex items-center justify-between text-xs gap-2">
                        <span className="text-emerald-300/80 font-medium">{c.position}</span>
                        {freq && (
                          <span className="text-emerald-400/60 font-mono">{freq}</span>
                        )}
                        <span className="text-slate-500 ml-auto">{c.identifiant}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Agents AFIS */}
            {afisEnServiceSafe.map((sess, idx) => (
              <div
                key={`afis-${sess.aeroport}-${idx}`}
                className={`p-3 rounded-xl border transition-colors ${sess.est_afis ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/35' : 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/35'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Flame className={`h-4 w-4 ${sess.est_afis ? 'text-red-400' : 'text-amber-400'}`} />
                  <span className={`text-base font-bold font-mono ${sess.est_afis ? 'text-red-300' : 'text-amber-300'}`}>{sess.aeroport}</span>
                  <span className={`w-2 h-2 rounded-full ml-auto ${sess.est_afis ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                </div>
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className={`font-medium ${sess.est_afis ? 'text-red-300/80' : 'text-amber-300/80'}`}>
                    {sess.est_afis ? 'AFIS' : 'Pompier seul'}
                  </span>
                  {sess.est_afis && vhfFreqMap.get(`${sess.aeroport}-AFIS`) && (
                    <span className={`font-mono ${sess.est_afis ? 'text-red-400/60' : 'text-amber-400/60'}`}>
                      {vhfFreqMap.get(`${sess.aeroport}-AFIS`)}
                    </span>
                  )}
                  <span className="text-slate-500 ml-auto">
                    {(sess.profiles as { identifiant?: string } | null)?.identifiant || '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel slide-out Gestion Parkings */}
      <AtcGestionParkingsPanel aeroport={session?.aeroport ?? null} />
    </div>
  );
}
