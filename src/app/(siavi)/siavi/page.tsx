import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { Flame, Plane, Clock, MapPin, AlertTriangle, ArrowRight, Activity, Users, Eye, Radio } from 'lucide-react';
import SeMettreEnServiceSiaviForm from '../SeMettreEnServiceSiaviForm';
import HorsServiceSiaviButton from '../HorsServiceSiaviButton';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const STATUT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  en_attente: { label: 'ATT', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  depose: { label: 'DEP', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  accepte: { label: 'ACC', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  en_cours: { label: 'VOL', color: 'text-sky-700', bgColor: 'bg-sky-100' },
  en_attente_cloture: { label: 'CLO', color: 'text-orange-700', bgColor: 'bg-orange-100' },
};

export default async function SiaviPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  
  const [{ data: session }, { data: afisSessionsRaw }, { data: atcSessionsRaw }] = await Promise.all([
    supabase.from('afis_sessions').select('id, aeroport, est_afis, started_at').eq('user_id', user.id).single(),
    admin.from('afis_sessions').select('aeroport, est_afis, user_id').order('aeroport'),
    admin.from('atc_sessions').select('aeroport, position, user_id').order('aeroport').order('position'),
  ]);

  // Enrichir les sessions AFIS avec les identifiants
  const afisEnService = await Promise.all((afisSessionsRaw || []).map(async (sess) => {
    let profiles = null;
    if (sess.user_id) {
      const { data } = await admin.from('profiles').select('identifiant').eq('id', sess.user_id).single();
      profiles = data;
    }
    return { ...sess, profiles };
  }));

  // Enrichir les sessions ATC avec les identifiants
  const atcEnService = await Promise.all((atcSessionsRaw || []).map(async (sess) => {
    let profiles = null;
    if (sess.user_id) {
      const { data } = await admin.from('profiles').select('identifiant').eq('id', sess.user_id).single();
      profiles = data;
    }
    return { ...sess, profiles };
  }));

  // Récupérer les plans surveillés par cet AFIS
  let plansSurveilles: any[] = [];
  if (session?.est_afis) {
    const { data } = await admin.from('plans_vol')
      .select('*')
      .eq('current_afis_user_id', user.id)
      .in('statut', ['accepte', 'en_cours', 'en_attente_cloture'])
      .order('created_at', { ascending: false });
    
    // Enrichir avec pilote
    plansSurveilles = await Promise.all((data || []).map(async (plan) => {
      let pilote = null;
      if (plan.pilote_id) {
        const { data: p } = await admin.from('profiles').select('identifiant').eq('id', plan.pilote_id).single();
        pilote = p;
      }
      return { ...plan, pilote };
    }));
  }

  const totalAfisEnService = afisEnService?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header avec stats */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/20 border border-red-500/30">
            <Flame className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-red-400">Centre SIAVI</h1>
            <p className="text-sm text-red-300">Service d&apos;Information de Vol</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="text-center px-4 py-2 rounded-lg bg-red-500/20 border-2 border-red-500/40">
            <p className="text-2xl font-bold text-red-400">{totalAfisEnService}</p>
            <p className="text-xs text-red-300 uppercase tracking-wide font-medium">AFIS en ligne</p>
          </div>
        </div>
      </div>

      {/* Statut de service */}
      {!session ? (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-amber-900 mb-1">Hors service</h2>
              <p className="text-amber-800 text-sm mb-4">
                Vous n&apos;êtes pas en service. Sélectionnez un aéroport pour commencer votre surveillance.
              </p>
              <SeMettreEnServiceSiaviForm />
            </div>
          </div>
        </div>
      ) : (
        <div className={`rounded-xl border-2 p-6 ${session.est_afis ? 'border-green-400 bg-green-50' : 'border-amber-400 bg-amber-50'}`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className={`p-3 rounded-lg ${session.est_afis ? 'bg-green-100' : 'bg-amber-100'}`}>
                  <Flame className={`h-6 w-6 ${session.est_afis ? 'text-green-600' : 'text-amber-600'}`} />
                </div>
                {session.est_afis && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-red-600 font-mono">{session.aeroport}</span>
                  {session.est_afis ? (
                    <span className="px-2 py-0.5 rounded bg-green-200 text-green-800 text-xs font-bold">AFIS</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-800 text-xs font-bold">POMPIER</span>
                  )}
                </div>
                <p className="text-sm text-slate-600 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  En service depuis {formatDistanceToNow(new Date(session.started_at), { locale: fr })}
                </p>
              </div>
            </div>
            <HorsServiceSiaviButton />
          </div>
          
          {!session.est_afis && (
            <div className="mt-4 p-3 rounded-lg bg-amber-100 border border-amber-300">
              <p className="text-amber-800 text-sm">
                <strong>Mode Pompier :</strong> Un contrôleur ATC est en ligne sur cet aéroport. 
                Vous pouvez utiliser le téléphone mais pas les fonctions AFIS.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Plans de vol surveillés */}
      {session?.est_afis && (
        <div className="rounded-xl border border-red-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-red-200 bg-red-50">
            <h2 className="text-lg font-semibold text-red-900 flex items-center gap-2">
              <Eye className="h-5 w-5 text-red-600" />
              Vols sous surveillance
            </h2>
            <span className="text-sm text-red-600">{plansSurveilles.length} vol(s)</span>
          </div>
          
          {plansSurveilles.length === 0 ? (
            <div className="text-center py-8">
              <Plane className="h-12 w-12 text-red-300 mx-auto mb-3" />
              <p className="text-red-600">Aucun vol sous votre surveillance</p>
              <p className="text-red-500 text-sm mt-1">Prenez un vol en autosurveillance depuis la barre latérale</p>
            </div>
          ) : (
            <div className="divide-y divide-red-100">
              {plansSurveilles.map((p) => {
                const config = STATUT_CONFIG[p.statut] || { label: p.statut, color: 'text-slate-700', bgColor: 'bg-slate-100' };
                return (
                  <Link 
                    key={p.id} 
                    href={`/siavi/plan/${p.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-red-50 transition-all group"
                  >
                    <div className={`px-2 py-1 rounded font-mono text-xs font-bold ${config.bgColor} ${config.color}`}>
                      {config.label}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 font-mono">{p.numero_vol}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{p.type_vol}</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-slate-600 mt-0.5">
                        <span className="font-mono text-sky-600">{p.aeroport_depart}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-mono text-emerald-600">{p.aeroport_arrivee}</span>
                        {p.temps_prev_min && (
                          <span className="ml-1 text-slate-500">• {p.temps_prev_min} min</span>
                        )}
                      </div>
                      {p.pilote?.identifiant && (
                        <p className="text-xs text-slate-500 mt-0.5">Pilote: {p.pilote.identifiant}</p>
                      )}
                    </div>
                    
                    <div className="text-sm text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      Voir →
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Positions en service (AFIS + ATC) */}
      <div className="rounded-xl border-2 border-red-300 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-red-800 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-red-700" />
          Positions en service
        </h2>
        
        {afisEnService.length === 0 && atcEnService.length === 0 ? (
          <div className="text-center py-6">
            <Flame className="h-10 w-10 text-red-400 mx-auto mb-2" />
            <p className="text-red-700 font-medium">Aucun agent en service</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Agents AFIS (en rouge/vert/orange) */}
            {afisEnService.map((sess, idx) => (
              <div 
                key={`afis-${sess.aeroport}-${idx}`}
                className={`p-3 rounded-lg border ${sess.est_afis ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Flame className={`h-4 w-4 ${sess.est_afis ? 'text-red-500' : 'text-amber-500'}`} />
                  <span className="text-lg font-bold text-red-600 font-mono">{sess.aeroport}</span>
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
            
            {/* Contrôleurs ATC (en bleu) */}
            {atcEnService.map((sess, idx) => (
              <div 
                key={`atc-${sess.aeroport}-${sess.position}-${idx}`}
                className="p-3 rounded-lg border bg-sky-50 border-sky-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Radio className="h-4 w-4 text-sky-500" />
                  <span className="text-lg font-bold text-sky-600 font-mono">{sess.aeroport}</span>
                  <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-sky-700 font-medium">{sess.position}</span>
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
