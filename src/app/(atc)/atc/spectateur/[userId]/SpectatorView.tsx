'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, Radio, Clock, ArrowLeft, ArrowRight, Plane, Users, Package, Ship, Building2, User, RefreshCw, WifiOff, Wifi } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import TranspondeurBadgeAtc from '@/components/TranspondeurBadgeAtc';

const STATUT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  en_attente: { label: 'ATT', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  depose: { label: 'DEP', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  accepte: { label: 'ACC', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  en_cours: { label: 'VOL', color: 'text-sky-700', bgColor: 'bg-sky-100' },
  en_attente_cloture: { label: 'CLO', color: 'text-orange-700', bgColor: 'bg-orange-100' },
};

interface Plan {
  id: string;
  numero_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: string;
  statut: string;
  current_holder_user_id?: string;
  temps_prev_min?: number;
  code_transpondeur?: string;
  mode_transpondeur?: string;
  vol_commercial?: boolean;
  vol_ferry?: boolean;
  nature_transport?: string;
  type_cargaison?: string;
  nb_pax_genere?: number;
  cargo_kg_genere?: number;
  pilote?: { identifiant: string } | null;
  compagnie?: { nom: string } | null;
  avion?: { immatriculation: string; nom_bapteme?: string } | null;
}

interface SpectatorViewProps {
  targetUserId: string;
  targetIdentifiant: string;
  targetSession: {
    aeroport: string;
    position: string;
    started_at: string;
  };
  initialPlans: Plan[];
}

export default function SpectatorView({ 
  targetUserId, 
  targetIdentifiant, 
  targetSession, 
  initialPlans 
}: SpectatorViewProps) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [isConnected, setIsConnected] = useState(true);
  const [isAtcOnline, setIsAtcOnline] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const router = useRouter();

  // Supabase Realtime pour les mises à jour en temps réel
  useEffect(() => {
    const supabase = createClient();

    // Channel pour les changements de plans_vol
    const plansChannel = supabase
      .channel('spectator-plans')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plans_vol',
          filter: `current_holder_user_id=eq.${targetUserId}`
        },
        async (payload) => {
          console.log('Plan change detected:', payload.eventType);
          setLastUpdate(new Date());
          
          if (payload.eventType === 'INSERT') {
            // Nouveau plan, enrichir et ajouter
            const newPlan = payload.new as Plan;
            const enrichedPlan = await enrichPlan(supabase, newPlan);
            setPlans(prev => [enrichedPlan, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedPlan = payload.new as Plan;
            // Si le plan n'appartient plus à cet ATC ou a un statut terminal, le retirer
            if (updatedPlan.current_holder_user_id !== targetUserId || 
                ['cloture', 'annule', 'refuse'].includes(updatedPlan.statut)) {
              setPlans(prev => prev.filter(p => p.id !== updatedPlan.id));
            } else {
              // Sinon, mettre à jour
              const enrichedPlan = await enrichPlan(supabase, updatedPlan);
              setPlans(prev => prev.map(p => p.id === enrichedPlan.id ? enrichedPlan : p));
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedPlan = payload.old as { id: string };
            setPlans(prev => prev.filter(p => p.id !== deletedPlan.id));
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Channel pour vérifier si l'ATC est toujours en service
    const sessionChannel = supabase
      .channel('spectator-session')
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'atc_sessions',
          filter: `user_id=eq.${targetUserId}`
        },
        () => {
          // L'ATC a quitté son service
          setIsAtcOnline(false);
        }
      )
      .subscribe();

    // Polling de sauvegarde toutes les 10 secondes
    const pollInterval = setInterval(async () => {
      try {
        // Vérifier si l'ATC est toujours en service
        const { data: session } = await supabase
          .from('atc_sessions')
          .select('id')
          .eq('user_id', targetUserId)
          .single();

        if (!session) {
          setIsAtcOnline(false);
          return;
        }

        // Rafraîchir les plans
        const { data: freshPlans } = await supabase
          .from('plans_vol')
          .select('*')
          .eq('current_holder_user_id', targetUserId)
          .is('pending_transfer_aeroport', null)
          .in('statut', ['en_cours', 'accepte', 'en_attente_cloture', 'depose', 'en_attente'])
          .order('created_at', { ascending: false });

        if (freshPlans) {
          const enriched = await Promise.all(freshPlans.map(p => enrichPlan(supabase, p)));
          setPlans(enriched);
          setLastUpdate(new Date());
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 10000);

    return () => {
      supabase.removeChannel(plansChannel);
      supabase.removeChannel(sessionChannel);
      clearInterval(pollInterval);
    };
  }, [targetUserId]);

  // Enrichir un plan avec pilote, compagnie, avion
  const enrichPlan = async (supabase: ReturnType<typeof createClient>, plan: any): Promise<Plan> => {
    let pilote = null;
    let compagnie = null;
    let avion = null;

    if (plan.pilote_id) {
      const { data } = await supabase.from('profiles').select('identifiant').eq('id', plan.pilote_id).single();
      pilote = data;
    }
    if (plan.compagnie_id) {
      const { data } = await supabase.from('compagnies').select('nom').eq('id', plan.compagnie_id).single();
      compagnie = data;
    }
    if (plan.compagnie_avion_id) {
      const { data } = await supabase.from('compagnie_avions').select('immatriculation, nom_bapteme').eq('id', plan.compagnie_avion_id).single();
      avion = data;
    }

    return { ...plan, pilote, compagnie, avion };
  };

  // Si l'ATC n'est plus en service
  if (!isAtcOnline) {
    return (
      <div className="space-y-6">
        <div className="card border-red-300 bg-red-50">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-red-100">
              <WifiOff className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Contrôleur hors service</h2>
              <p className="text-slate-600 text-sm">
                {targetIdentifiant} n&apos;est plus en service. La session d&apos;observation a été terminée.
              </p>
            </div>
            <Link
              href="/atc"
              className="px-4 py-2 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors"
            >
              Retour au centre de contrôle
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header mode spectateur */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/atc"
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </Link>
          <div className="p-2 rounded-lg bg-sky-100">
            <Eye className="h-6 w-6 text-sky-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Mode Spectateur</h1>
            <p className="text-sm text-slate-600">Observation en temps réel</p>
          </div>
        </div>

        {/* Indicateur de connexion */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isConnected 
              ? 'bg-emerald-100 text-emerald-700' 
              : 'bg-amber-100 text-amber-700'
          }`}>
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4" />
                En direct
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4" />
                Reconnexion...
              </>
            )}
          </div>
          <span className="text-xs text-slate-500">
            Mis à jour {formatDistanceToNow(lastUpdate, { locale: fr, addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Info contrôleur observé */}
      <div className="card border-sky-300 bg-gradient-to-r from-sky-50 to-indigo-50">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative">
            <div className="p-3 rounded-lg bg-sky-100">
              <Radio className="h-6 w-6 text-sky-600" />
            </div>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-sky-500 rounded-full animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-lg font-bold text-slate-900">{targetIdentifiant}</span>
              <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-700 text-sm font-medium">
                {targetSession.aeroport} — {targetSession.position}
              </span>
            </div>
            <p className="text-sm text-slate-600 flex items-center gap-1 mt-1">
              <Clock className="h-3.5 w-3.5" />
              En service depuis {formatDistanceToNow(new Date(targetSession.started_at), { locale: fr })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.refresh()}
              className="p-2 rounded-lg bg-white/50 hover:bg-white transition-colors"
              title="Actualiser"
            >
              <RefreshCw className="h-5 w-5 text-slate-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Plans de vol sous contrôle */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Plane className="h-5 w-5 text-sky-600" />
            Trafic sous contrôle
          </h2>
          <span className="text-sm text-slate-600">{plans.length} vol(s)</span>
        </div>

        {plans.length === 0 ? (
          <div className="text-center py-8">
            <Plane className="h-12 w-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600">Aucun vol sous contrôle actuellement</p>
            <p className="text-slate-500 text-sm mt-1">Les vols apparaîtront ici en temps réel</p>
          </div>
        ) : (
          <div className="space-y-2">
            {plans.map((p) => {
              const config = STATUT_CONFIG[p.statut] || { label: p.statut, color: 'text-slate-700', bgColor: 'bg-slate-100' };
              
              return (
                <div 
                  key={p.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200 transition-all"
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
                      {p.avion?.immatriculation && (
                        <span className="ml-1 text-slate-500 font-mono">• {p.avion.immatriculation}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      {p.pilote?.identifiant && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {p.pilote.identifiant}
                        </span>
                      )}
                      {p.compagnie?.nom && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {p.compagnie.nom}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Note mode spectateur */}
      <div className="text-center text-sm text-slate-500 py-2">
        <p className="flex items-center justify-center gap-2">
          <Eye className="h-4 w-4" />
          Mode lecture seule — Les données se mettent à jour automatiquement
        </p>
      </div>
    </div>
  );
}
