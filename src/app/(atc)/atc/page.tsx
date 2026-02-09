import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { Radio, Plane, Clock, MapPin, AlertTriangle, ArrowRight, Activity, Users, Package, Ship, Building2, User, FilePlus, Radar, Flame, ArrowDownToLine } from 'lucide-react';
import TranspondeurBadgeAtc from '@/components/TranspondeurBadgeAtc';
import SeMettreEnServiceForm from '../SeMettreEnServiceForm';
import HorsServiceButton from '../HorsServiceButton';
import AccepterTransfertButton from './AccepterTransfertButton';
import PlansEnAttenteModal from '@/components/PlansEnAttenteModal';
import AtcEnLigneModal from '@/components/AtcEnLigneModal';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { PlanVol, AtcSession } from '@/lib/types';

// Type pour les plans enrichis avec données relationnelles
type EnrichedPlan = PlanVol & {
  temps_prev_min?: number;
};

const STATUT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  en_attente: { label: 'ATT', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  depose: { label: 'DEP', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  accepte: { label: 'ACC', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  en_cours: { label: 'VOL', color: 'text-sky-700', bgColor: 'bg-sky-100' },
  en_attente_cloture: { label: 'CLO', color: 'text-orange-700', bgColor: 'bg-orange-100' },
};

export default async function AtcPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  
  // D'abord récupérer la session pour l'utiliser dans les requêtes suivantes
  const { data: session } = await supabase.from('atc_sessions').select('id, aeroport, position, started_at').eq('user_id', user.id).single();
  
  const [{ data: plansChezMoiRaw }, { data: sessionsEnServiceRaw }, { data: plansEnAttente }, { data: plansOrphelinsRaw }, { data: afisSessionsRaw }, { data: transfertsEntrantsRaw }] = await Promise.all([
    admin.from('plans_vol').select('*').eq('current_holder_user_id', user.id).is('pending_transfer_aeroport', null).in('statut', ['en_cours', 'accepte', 'en_attente_cloture', 'depose', 'en_attente']).order('created_at', { ascending: false }),
    admin.from('atc_sessions').select('aeroport, position, user_id').order('aeroport').order('position'),
    admin.from('plans_vol').select('id').in('statut', ['depose', 'en_attente']),
    admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee, current_holder_user_id').in('statut', ['depose', 'en_attente']).order('created_at', { ascending: false }).limit(20),
    admin.from('afis_sessions').select('aeroport, est_afis, user_id').order('aeroport'),
    // Transferts entrants : plans avec pending_transfer vers notre position
    session ? admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee, pending_transfer_at, current_holder_user_id').eq('pending_transfer_aeroport', session.aeroport).eq('pending_transfer_position', session.position).not('pending_transfer_at', 'is', null) : Promise.resolve({ data: [] }),
  ]);

  // Enrichir les plans avec les données pilote, compagnie et avion
  const plansChezMoi = await Promise.all((plansChezMoiRaw || []).map(async (plan) => {
    let pilote = null;
    let compagnie = null;
    let avion = null;

    if (plan.pilote_id) {
      const { data } = await admin.from('profiles').select('identifiant').eq('id', plan.pilote_id).single();
      pilote = data;
    }
    if (plan.compagnie_id) {
      const { data } = await admin.from('compagnies').select('nom').eq('id', plan.compagnie_id).single();
      compagnie = data;
    }
    if (plan.compagnie_avion_id) {
      const { data } = await admin.from('compagnie_avions').select('immatriculation, nom_bapteme').eq('id', plan.compagnie_avion_id).single();
      avion = data;
    }

    return { ...plan, pilote, compagnie, avion };
  }));

  // Enrichir les sessions ATC avec les identifiants
  const sessionsEnService = await Promise.all((sessionsEnServiceRaw || []).map(async (sess) => {
    let profiles = null;
    if (sess.user_id) {
      const { data } = await admin.from('profiles').select('identifiant').eq('id', sess.user_id).single();
      profiles = data;
    }
    return { ...sess, profiles };
  }));

  // Enrichir les sessions AFIS avec les identifiants
  const afisEnService = await Promise.all((afisSessionsRaw || []).map(async (sess) => {
    let profiles = null;
    if (sess.user_id) {
      const { data } = await admin.from('profiles').select('identifiant').eq('id', sess.user_id).single();
      profiles = data;
    }
    return { ...sess, profiles };
  }));

  // Grouper les sessions par aéroport
  const byAeroport = (sessionsEnService ?? []).reduce<Record<string, Array<{ position: string; identifiant: string }>>>((acc, s) => {
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
  const sessionsActives = new Set((sessionsEnServiceRaw ?? []).map((s) => s.user_id));
  const plansOrphelins = (plansOrphelinsRaw ?? []).filter((p) => !p.current_holder_user_id || !sessionsActives.has(p.current_holder_user_id));
  
  // Filtrer les transferts entrants valides (moins d'1 minute)
  const oneMinAgo = new Date(Date.now() - 60000).toISOString();
  const transfertsEntrants = (transfertsEntrantsRaw ?? []).filter((t) => t.pending_transfer_at && t.pending_transfer_at > oneMinAgo);

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
            sessionsEnService={sessionsEnService.map(s => ({
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

      {/* Transferts entrants */}
      {session && transfertsEntrants.length > 0 && (
        <div className="card border-orange-400 bg-orange-50 animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-orange-600" />
              Transferts entrants
            </h2>
            <span className="text-sm text-orange-600 font-medium">{transfertsEntrants.length} en attente</span>
          </div>
          <div className="space-y-2">
            {transfertsEntrants.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-orange-100 border border-orange-300"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-semibold text-slate-900">{t.numero_vol}</p>
                  <p className="text-xs text-slate-600">{t.aeroport_depart} → {t.aeroport_arrivee}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/atc/plan/${t.id}`}
                    className="text-xs text-orange-700 font-medium hover:underline"
                  >
                    Voir
                  </Link>
                  <AccepterTransfertButton planId={t.id} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-orange-600 mt-3">Expire après 1 minute</p>
        </div>
      )}

      {/* Plans orphelins */}
      {session && (
        <div className="card border-amber-300 bg-amber-50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Radar className="h-5 w-5 text-amber-600" />
              Plans orphelins
            </h2>
            <span className="text-sm text-slate-600">{plansOrphelins.length} plan(s)</span>
          </div>
          {plansOrphelins.length === 0 ? (
            <p className="text-slate-600 text-sm">Aucun plan orphelin détecté.</p>
          ) : (
            <div className="space-y-2">
              {plansOrphelins.map((p) => (
                <Link
                  key={p.id}
                  href={`/atc/plan/${p.id}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-100/40 border border-amber-200 hover:bg-amber-100 transition-colors"
                  title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee}`}
                >
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-slate-900">{p.numero_vol}</p>
                    <p className="text-xs text-slate-600">{p.aeroport_depart} → {p.aeroport_arrivee}</p>
                  </div>
                  <span className="text-xs text-amber-700 font-medium">Ouvrir</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Plans de vol sous contrôle */}
      {session && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
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
            <div className="text-center py-8">
              <Plane className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600">Aucun plan de vol sous votre contrôle</p>
              <p className="text-slate-500 text-sm mt-1">Les nouveaux plans apparaîtront ici automatiquement</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(plansChezMoi as EnrichedPlan[]).map((p) => {
                const config = STATUT_CONFIG[p.statut] || { label: p.statut, color: 'text-slate-700', bgColor: 'bg-slate-100' };
                const pilote = p.pilote;
                const compagnie = p.compagnie;
                const avion = p.avion;
                
                return (
                  <Link 
                    key={p.id} 
                    href={`/atc/plan/${p.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all group"
                  >
                    {/* Indicateur de statut */}
                    <div className={`px-2 py-1 rounded font-mono text-xs font-bold ${config.bgColor} ${config.color}`}>
                      {config.label}
                    </div>
                    
                    {/* Info vol */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 font-mono">{p.numero_vol}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{p.type_vol}</span>
                        {/* Transpondeur */}
                        {p.code_transpondeur && (
                          <TranspondeurBadgeAtc 
                            code={p.code_transpondeur} 
                            mode={p.mode_transpondeur || 'C'} 
                            size="sm"
                          />
                        )}
                        {p.vol_ferry && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-1">
                            <Ship className="h-3 w-3" />
                            FERRY
                          </span>
                        )}
                        {p.vol_commercial && p.nature_transport === 'passagers' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {p.nb_pax_genere || '?'} PAX
                          </span>
                        )}
                        {p.vol_commercial && p.nature_transport === 'cargo' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {p.cargo_kg_genere || '?'} kg {p.type_cargaison ? `(${p.type_cargaison})` : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-slate-600 mt-0.5 flex-wrap">
                        <span className="font-mono text-sky-600">{p.aeroport_depart}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-mono text-emerald-600">{p.aeroport_arrivee}</span>
                        {p.temps_prev_min && (
                          <span className="ml-1 text-slate-500">• {p.temps_prev_min} min</span>
                        )}
                        {avion?.immatriculation && (
                          <span className="ml-1 text-slate-500 font-mono">• {avion.immatriculation}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        {pilote?.identifiant && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {pilote.identifiant}
                          </span>
                        )}
                        {compagnie?.nom && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {compagnie.nom}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Action */}
                    <div className="text-sm text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      Voir →
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Positions en service (ATC + AFIS) */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-sky-600" />
          Positions en service
        </h2>
        
        {Object.keys(byAeroport).length === 0 && afisEnService.length === 0 ? (
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
                  {controllers.map((c, idx) => (
                    <div key={`${apt}-${c.position}-${idx}`} className="flex items-center justify-between text-sm">
                      <span className="text-emerald-700 font-medium">{c.position}</span>
                      <span className="text-slate-500 text-xs">{c.identifiant}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* Agents AFIS (en rouge) */}
            {afisEnService.map((sess, idx) => (
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
                <div className="flex items-center justify-between text-sm">
                  <span className={sess.est_afis ? 'text-red-700 font-medium' : 'text-amber-700 font-medium'}>
                    {sess.est_afis ? 'AFIS' : 'Pompier seul'}
                  </span>
                  <span className="text-slate-500 text-xs">
                    {sess.profiles?.identifiant || '—'}
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
