import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { Radio, Plane, Clock, MapPin, AlertTriangle, Activity, FilePlus, Flame } from 'lucide-react';
import SeMettreEnServiceForm from '../SeMettreEnServiceForm';
import HorsServiceButton from '../HorsServiceButton';
import PlansEnAttenteModal from '@/components/PlansEnAttenteModal';
import AtcEnLigneModal from '@/components/AtcEnLigneModal';
import FlightStripBoardWrapper from '@/components/FlightStripBoardWrapper';
import VhfRadio from '@/components/VhfRadio';
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
  
  const [{ data: plansChezMoiRaw }, { data: sessionsEnService }, { data: plansEnAttente }, { data: afisEnService }] = await Promise.all([
    admin.from('plans_vol').select('*').eq('current_holder_user_id', user.id).is('pending_transfer_aeroport', null).in('statut', ['en_cours', 'accepte', 'en_attente_cloture', 'depose', 'en_attente']).order('created_at', { ascending: false }),
    admin.from('atc_sessions').select('aeroport, position, user_id, profiles!atc_sessions_user_id_fkey(identifiant)').order('aeroport').order('position'),
    admin.from('plans_vol').select('id').in('statut', ['depose', 'en_attente']),
    admin.from('afis_sessions').select('aeroport, est_afis, user_id, profiles!afis_sessions_user_id_fkey(identifiant)').order('aeroport'),
  ]);

  // Enrichir les plans avec les données pilote, compagnie et avion (pour strips)
  const plansChezMoi: StripData[] = await Promise.all((plansChezMoiRaw || []).map(async (plan) => {
    let immatriculation: string | null = null;
    let typeAvionCodeOaci: string | null = null;
    let typeAvionNom: string | null = null;
    let piloteIdentifiant: string | null = null;

    if (plan.compagnie_avion_id) {
      const { data: avionData } = await admin.from('compagnie_avions')
        .select('immatriculation, type_avion_id')
        .eq('id', plan.compagnie_avion_id)
        .single();
      if (avionData) {
        immatriculation = avionData.immatriculation;
        if (avionData.type_avion_id) {
          const { data: typeData } = await admin.from('types_avion')
            .select('nom, code_oaci')
            .eq('id', avionData.type_avion_id)
            .single();
          if (typeData) {
            typeAvionCodeOaci = typeData.code_oaci;
            typeAvionNom = typeData.nom;
          }
        }
      }
    }

    if (plan.pilote_id) {
      const { data: piloteData } = await admin.from('profiles')
        .select('identifiant')
        .eq('id', plan.pilote_id)
        .single();
      if (piloteData) piloteIdentifiant = piloteData.identifiant;
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
      squawk_attendu: plan.code_transpondeur || null,
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
      strip_zone: plan.strip_zone || null,
      strip_order: plan.strip_order ?? 0,
      pilote_identifiant: piloteIdentifiant,
      intentions_vol: plan.intentions_vol || null,
      instructions_atc: plan.instructions || null,
      automonitoring: plan.automonitoring ?? false,
    } as StripData;
  }));

  // Les sessions sont déjà enrichies avec les JOIN dans la requête ci-dessus
  // Fallback pour éviter les erreurs TypeScript
  const sessionsEnServiceSafe = sessionsEnService ?? [];
  const afisEnServiceSafe = afisEnService ?? [];

  // Récupérer la fréquence VHF de la position de l'ATC + identifiant
  let atcFrequency: string | null = null;
  let atcIdentifiant = 'ATC';
  if (session) {
    const { data: vhfData } = await admin
      .from('vhf_position_frequencies')
      .select('frequency')
      .eq('aeroport', session.aeroport)
      .eq('position', session.position)
      .maybeSingle();
    atcFrequency = vhfData?.frequency || null;

    const { data: profData } = await admin
      .from('profiles')
      .select('identifiant')
      .eq('id', user.id)
      .single();
    atcIdentifiant = profData?.identifiant || 'ATC';
  }

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
      {/* Header avec stats */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100">
            <Radio className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Centre de contrôle</h1>
            <p className="text-sm text-slate-600">Interface de contrôle aérien</p>
          </div>
        </div>
        <div className="flex gap-4">
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

      {/* Statut de service */}
      {!session ? (
        <div className="card border-amber-300 bg-amber-50">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Hors service</h2>
              <p className="text-slate-600 text-sm mb-4">
                Vous n&apos;êtes pas en service. Sélectionnez un aéroport et une position pour commencer à contrôler.
              </p>
              <SeMettreEnServiceForm />
            </div>
          </div>
        </div>
      ) : (
        <div className="card border-emerald-300 bg-emerald-50">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="p-3 rounded-lg bg-emerald-100">
                  <Radio className="h-6 w-6 text-emerald-600" />
                </div>
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-emerald-600 font-mono">{session.aeroport}</span>
                  <span className="text-slate-400">—</span>
                  <span className="text-lg font-semibold text-slate-800">{session.position}</span>
                </div>
                <p className="text-sm text-slate-600 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  En service depuis {formatDistanceToNow(new Date(session.started_at), { locale: fr })}
                </p>
              </div>
            </div>
            <HorsServiceButton />
          </div>
        </div>
      )}

      {/* Radio VHF */}
      {session && atcFrequency && (
        <VhfRadio
          mode="atc"
          lockedFrequency={atcFrequency}
          participantName={`${atcIdentifiant} (${session.aeroport} ${session.position})`}
        />
      )}

      {/* Flight Strips Board */}
      {session && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-600" />
              Trafic sous contrôle
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">{plansChezMoi?.length || 0} vol(s)</span>
              <Link
                href="/atc/creer-plan"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <FilePlus className="h-4 w-4" />
                Créer un plan
              </Link>
            </div>
          </div>
          
          {!plansChezMoi || plansChezMoi.length === 0 ? (
            <div className="card text-center py-8">
              <Plane className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600">Aucun plan de vol sous votre contrôle</p>
              <p className="text-slate-500 text-sm mt-1">Les nouveaux plans apparaîtront ici automatiquement</p>
            </div>
          ) : (
            <FlightStripBoardWrapper 
              allStrips={plansChezMoi} 
              plansATraiter={plansChezMoi.filter(s => ['depose', 'en_attente'].includes(s.statut)).map(s => s.id)}
            />
          )}
        </div>
      )}

      {/* Positions en service (ATC + AFIS) */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-sky-600" />
          Positions en service
        </h2>
        
        {Object.keys(byAeroport).length === 0 && afisEnServiceSafe.length === 0 ? (
          <div className="text-center py-6">
            <Radio className="h-10 w-10 text-slate-400 mx-auto mb-2" />
            <p className="text-slate-600">Aucune position en service</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Contrôleurs ATC (en vert) */}
            {Object.entries(byAeroport).map(([apt, controllers]) => (
              <div 
                key={`atc-${apt}`} 
                className="p-3 rounded-lg bg-emerald-50 border border-emerald-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Radio className="h-4 w-4 text-emerald-500" />
                  <span className="text-lg font-bold text-emerald-600 font-mono">{apt}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div className="space-y-1">
                  {controllers.map((c, idx) => {
                    const freq = vhfFreqMap.get(`${apt}-${c.position}`);
                    return (
                      <div key={`${apt}-${c.position}-${idx}`} className="flex items-center justify-between text-sm gap-2">
                        <span className="text-emerald-700 font-medium">{c.position}</span>
                        {freq && (
                          <span className="text-emerald-600/70 font-mono text-[11px]">{freq}</span>
                        )}
                        <span className="text-slate-500 text-xs ml-auto">{c.identifiant}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            
            {/* Agents AFIS (en rouge) */}
            {afisEnServiceSafe.map((sess, idx) => (
              <div 
                key={`afis-${sess.aeroport}-${idx}`}
                className={`p-3 rounded-lg border ${sess.est_afis ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Flame className={`h-4 w-4 ${sess.est_afis ? 'text-red-500' : 'text-amber-500'}`} />
                  <span className={`text-lg font-bold font-mono ${sess.est_afis ? 'text-red-600' : 'text-amber-600'}`}>{sess.aeroport}</span>
                  {sess.est_afis ? (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                  )}
                </div>
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className={sess.est_afis ? 'text-red-700 font-medium' : 'text-amber-700 font-medium'}>
                    {sess.est_afis ? 'AFIS' : 'Pompier seul'}
                  </span>
                  {sess.est_afis && vhfFreqMap.get(`${sess.aeroport}-AFIS`) && (
                    <span className="text-red-600/70 font-mono text-[11px]">
                      {vhfFreqMap.get(`${sess.aeroport}-AFIS`)}
                    </span>
                  )}
                  <span className="text-slate-500 text-xs ml-auto">
                    {(sess.profiles as { identifiant?: string } | null)?.identifiant || '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
