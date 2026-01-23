import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { Radio, Plane, Clock, MapPin, AlertTriangle, ArrowRight, Activity } from 'lucide-react';
import SeMettreEnServiceForm from '../SeMettreEnServiceForm';
import HorsServiceButton from '../HorsServiceButton';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

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
  const [{ data: session }, { data: plansChezMoi }, { data: sessionsEnService }, { data: plansEnAttente }] = await Promise.all([
    supabase.from('atc_sessions').select('id, aeroport, position, started_at').eq('user_id', user.id).single(),
    admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee, statut, type_vol, temps_prev_min, created_at').eq('current_holder_user_id', user.id).is('pending_transfer_aeroport', null).in('statut', ['en_cours', 'accepte', 'en_attente_cloture', 'depose', 'en_attente']).order('created_at', { ascending: false }),
    admin.from('atc_sessions').select('aeroport, position, user_id, profiles(identifiant)').order('aeroport').order('position'),
    admin.from('plans_vol').select('id').in('statut', ['depose', 'en_attente']),
  ]);

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
          <div className="text-center px-4 py-2 rounded-lg bg-emerald-100 border border-emerald-200">
            <p className="text-2xl font-bold text-emerald-600">{totalAtcEnService}</p>
            <p className="text-xs text-emerald-700 uppercase tracking-wide">ATC en ligne</p>
          </div>
          <div className="text-center px-4 py-2 rounded-lg bg-amber-100 border border-amber-200">
            <p className="text-2xl font-bold text-amber-600">{totalPlansEnAttente}</p>
            <p className="text-xs text-amber-700 uppercase tracking-wide">Plans en attente</p>
          </div>
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

      {/* Plans de vol sous contrôle */}
      {session && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-600" />
              Trafic sous contrôle
            </h2>
            <span className="text-sm text-slate-600">{plansChezMoi?.length || 0} vol(s)</span>
          </div>
          
          {!plansChezMoi || plansChezMoi.length === 0 ? (
            <div className="text-center py-8">
              <Plane className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600">Aucun plan de vol sous votre contrôle</p>
              <p className="text-slate-500 text-sm mt-1">Les nouveaux plans apparaîtront ici automatiquement</p>
            </div>
          ) : (
            <div className="space-y-2">
              {plansChezMoi.map((p) => {
                const config = STATUT_CONFIG[p.statut] || { label: p.statut, color: 'text-slate-700', bgColor: 'bg-slate-100' };
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
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 font-mono">{p.numero_vol}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{p.type_vol}</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-slate-600 mt-0.5">
                        <span className="font-mono text-sky-600">{p.aeroport_depart}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-mono text-emerald-600">{p.aeroport_arrivee}</span>
                        {p.temps_prev_min && (
                          <span className="ml-2 text-slate-500">• {p.temps_prev_min} min</span>
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

      {/* Aéroports en service */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-sky-600" />
          Aéroports contrôlés
        </h2>
        
        {Object.keys(byAeroport).length === 0 ? (
          <div className="text-center py-6">
            <Radio className="h-10 w-10 text-slate-400 mx-auto mb-2" />
            <p className="text-slate-600">Aucun contrôleur en service</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(byAeroport).map(([apt, controllers]) => (
              <div 
                key={apt} 
                className="p-3 rounded-lg bg-slate-50 border border-slate-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg font-bold text-emerald-600 font-mono">{apt}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div className="space-y-1">
                  {controllers.map((c, idx) => (
                    <div key={`${apt}-${c.position}-${idx}`} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 font-medium">{c.position}</span>
                      <span className="text-slate-500 text-xs">{c.identifiant}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
