import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plane, Clock, FileText, Eye, Radio, Navigation, Users, Package, Ship, Building2, User, Percent, AlertTriangle } from 'lucide-react';
import PrendreVolAfisButton from './PrendreVolAfisButton';
import RelacherVolAfisButton from './RelacherVolAfisButton';
import TranspondeurBadgeAtc from '@/components/TranspondeurBadgeAtc';

export const dynamic = 'force-dynamic';

const STATUT_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  depose: { label: 'Déposé', color: 'text-slate-700', bgColor: 'bg-slate-100', icon: <FileText className="h-4 w-4" /> },
  en_attente: { label: 'En attente ATC', color: 'text-amber-700', bgColor: 'bg-amber-100', icon: <Clock className="h-4 w-4" /> },
  accepte: { label: 'Accepté', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: <Plane className="h-4 w-4" /> },
  en_cours: { label: 'En vol', color: 'text-sky-700', bgColor: 'bg-sky-100', icon: <Plane className="h-4 w-4" /> },
  automonitoring: { label: 'Autosurveillance', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: <Radio className="h-4 w-4" /> },
  en_attente_cloture: { label: 'Clôture demandée', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: <AlertTriangle className="h-4 w-4" /> },
};

export default async function SiaviPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  
  // Vérifier que l'utilisateur a accès SIAVI et est en service AFIS
  const [{ data: profile }, { data: afisSession }] = await Promise.all([
    supabase.from('profiles').select('role, siavi').eq('id', user.id).single(),
    supabase.from('afis_sessions').select('id, est_afis').eq('user_id', user.id).single(),
  ]);

  const canSiavi = profile?.role === 'admin' || Boolean(profile?.siavi);
  if (!canSiavi) redirect('/logbook');

  // Charger le plan de vol
  const { data: planData } = await admin
    .from('plans_vol')
    .select('*')
    .eq('id', id)
    .single();

  if (!planData) notFound();

  // Charger les données liées
  let pilote = null;
  let compagnie = null;
  let avion = null;

  if (planData.pilote_id) {
    const { data } = await admin.from('profiles').select('identifiant').eq('id', planData.pilote_id).single();
    pilote = data;
  }

  if (planData.compagnie_id) {
    const { data } = await admin.from('compagnies').select('nom, code_oaci').eq('id', planData.compagnie_id).single();
    compagnie = data;
  }

  if (planData.compagnie_avion_id) {
    const { data: avionData } = await admin.from('compagnie_avions')
      .select('immatriculation, nom_bapteme, usure_percent, type_avion_id')
      .eq('id', planData.compagnie_avion_id)
      .single();
    
    if (avionData?.type_avion_id) {
      const { data: typeData } = await admin.from('types_avion').select('nom').eq('id', avionData.type_avion_id).single();
      avion = { ...avionData, types_avion: typeData };
    } else {
      avion = avionData;
    }
  }

  const plan = { ...planData, pilote, compagnie, avion };
  const statusConfig = STATUT_CONFIG[plan.statut] || { label: plan.statut, color: 'text-slate-700', bgColor: 'bg-slate-100', icon: <FileText className="h-4 w-4" /> };

  const estEnService = !!afisSession;
  const estAfis = afisSession?.est_afis ?? false;
  const estSurveillePar = plan.current_afis_user_id;
  const estMonVol = estSurveillePar === user.id;
  const peutPrendre = estAfis && plan.automonitoring && !estSurveillePar && !plan.current_holder_user_id;
  const peutRelacher = estAfis && estMonVol;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/siavi" className="p-2 rounded-lg bg-red-100 text-red-600 hover:text-red-900 hover:bg-red-200 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-red-900 font-mono">{plan.numero_vol}</h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
            {/* Transpondeur */}
            {(plan as any).code_transpondeur && (
              <TranspondeurBadgeAtc 
                code={(plan as any).code_transpondeur} 
                mode={(plan as any).mode_transpondeur || 'C'} 
                size="md"
              />
            )}
          </div>
        </div>
      </div>

      {/* Avertissement lecture seule */}
      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
        <div className="flex items-center gap-3">
          <Eye className="h-5 w-5 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-800">Mode observation SIAVI</p>
            <p className="text-amber-700 text-sm">Vous pouvez visualiser les informations du vol mais pas le modifier.</p>
          </div>
        </div>
      </div>

      {/* Info vol principale */}
      <div className="rounded-xl border border-red-200 bg-white/90 p-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Route */}
          <div>
            <h3 className="text-sm font-medium text-red-600 uppercase tracking-wide mb-3">Route</h3>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-sky-600 font-mono">{plan.aeroport_depart}</p>
                <p className="text-xs text-slate-500 mt-1">Départ</p>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <div className="w-full h-px bg-gradient-to-r from-sky-500 via-slate-400 to-emerald-500 relative">
                  <Plane className="h-4 w-4 text-slate-600 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-1" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-600 font-mono">{plan.aeroport_arrivee}</p>
                <p className="text-xs text-slate-500 mt-1">Arrivée</p>
              </div>
            </div>
          </div>

          {/* Détails */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Type de vol</p>
              <p className="text-lg font-semibold text-slate-800">{plan.type_vol}</p>
            </div>
            {plan.temps_prev_min && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Temps prévu</p>
                <p className="text-lg font-semibold text-slate-800 flex items-center gap-1">
                  <Clock className="h-4 w-4 text-slate-500" />
                  {plan.temps_prev_min} min
                </p>
              </div>
            )}
          </div>
        </div>
        
        {/* Informations pilote, compagnie et avion */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <h3 className="text-sm font-medium text-red-600 uppercase tracking-wide mb-3">Informations complémentaires</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pilote?.identifiant && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <User className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Pilote</p>
                  <p className="font-medium text-slate-800">{pilote.identifiant}</p>
                </div>
              </div>
            )}
            
            {compagnie?.nom && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Building2 className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Compagnie</p>
                  <p className="font-medium text-slate-800">{compagnie.nom}</p>
                </div>
              </div>
            )}
            
            {avion?.immatriculation && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Plane className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">Avion</p>
                  <p className="font-medium text-slate-800 font-mono">{avion.immatriculation}</p>
                </div>
              </div>
            )}

            {avion?.usure_percent !== undefined && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Percent className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500">État avion</p>
                  <p className={`font-medium ${avion.usure_percent >= 70 ? 'text-emerald-600' : avion.usure_percent >= 30 ? 'text-amber-600' : 'text-red-600'}`}>
                    {avion.usure_percent}%
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Type de vol (commercial, ferry, etc.) */}
          <div className="flex flex-wrap gap-2 mt-4">
            {(plan as any).vol_ferry && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-sm font-medium">
                <Ship className="h-4 w-4" />
                Vol Ferry
              </span>
            )}
            {(plan as any).vol_commercial && (plan as any).nature_transport === 'passagers' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 text-sm font-medium">
                <Users className="h-4 w-4" />
                {(plan as any).nb_pax_genere || 0} passagers
              </span>
            )}
            {(plan as any).vol_commercial && (plan as any).nature_transport === 'cargo' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-sm font-medium">
                <Package className="h-4 w-4" />
                {(plan as any).cargo_kg_genere || 0} kg cargo
              </span>
            )}
          </div>
        </div>

        {/* Infos VFR/IFR */}
        {plan.type_vol === 'VFR' && plan.intentions_vol && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-medium text-red-600 uppercase tracking-wide mb-2 flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              Intentions de vol
            </h3>
            <p className="text-slate-700 bg-slate-50 rounded-lg p-3 text-sm">{plan.intentions_vol}</p>
          </div>
        )}

        {plan.type_vol === 'IFR' && (
          <div className="mt-6 pt-6 border-t border-slate-200 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {plan.sid_depart && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">SID Départ</p>
                  <p className="text-lg font-mono text-sky-600">{plan.sid_depart}</p>
                </div>
              )}
              {plan.star_arrivee && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">STAR Arrivée</p>
                  <p className="text-lg font-mono text-emerald-600">{plan.star_arrivee}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Instructions ATC */}
        {plan.instructions && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-2">Instructions ATC</h3>
            <p className="text-slate-700 bg-slate-50 rounded-lg p-3 text-sm">{plan.instructions}</p>
          </div>
        )}
      </div>

      {/* Actions AFIS */}
      {estEnService && estAfis && (
        <div className="rounded-xl border border-red-200 bg-white/90 p-6">
          <h3 className="font-semibold text-red-900 mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5 text-red-600" />
            Actions AFIS
          </h3>
          
          {peutPrendre && (
            <div className="space-y-3">
              <p className="text-slate-600 text-sm">Ce vol est en autosurveillance. Vous pouvez le prendre sous votre surveillance.</p>
              <PrendreVolAfisButton planId={plan.id} />
            </div>
          )}

          {estMonVol && (
            <div className="space-y-3">
              <p className="text-slate-600 text-sm">Ce vol est sous votre surveillance. Vous pouvez le relâcher pour qu&apos;il retourne en autosurveillance.</p>
              <RelacherVolAfisButton planId={plan.id} />
            </div>
          )}

          {estSurveillePar && !estMonVol && (
            <p className="text-amber-600 text-sm">Ce vol est surveillé par un autre agent AFIS.</p>
          )}

          {!plan.automonitoring && plan.current_holder_user_id && (
            <p className="text-slate-600 text-sm">Ce vol est contrôlé par un ATC. Mode observation uniquement.</p>
          )}
        </div>
      )}

      {/* Message si pas en service */}
      {!estEnService && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-amber-700 text-sm">Mettez-vous en service pour pouvoir prendre des vols sous surveillance.</p>
        </div>
      )}

      {estEnService && !estAfis && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-amber-700 text-sm">Vous êtes en mode Pompier. Les fonctions AFIS ne sont pas disponibles car un ATC est en ligne.</p>
        </div>
      )}
    </div>
  );
}
