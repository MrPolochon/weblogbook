import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, Plane, MapPin, Wrench, Landmark } from 'lucide-react';
import Link from 'next/link';
import FlotteSiaviClient from './FlotteSiaviClient';

export default async function FlotteSiaviPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles')
    .select('role, siavi, siavi_grade_id')
    .eq('id', user.id)
    .single();

  const canSiavi = profile?.role === 'admin' || profile?.role === 'siavi' || profile?.siavi;
  if (!canSiavi) redirect('/logbook');

  const admin = createAdminClient();

  let isChef = profile?.role === 'admin';
  if (!isChef && profile?.siavi_grade_id) {
    const { data: grade } = await admin.from('siavi_grades')
      .select('nom')
      .eq('id', profile.siavi_grade_id)
      .single();
    if (grade?.nom === 'Chef de brigade SIAVI') isChef = true;
  }

  const [
    { data: avions },
    { data: hubs },
    { data: config },
    { data: compteSiavi },
  ] = await Promise.all([
    admin.from('siavi_avions')
      .select('*, types_avion:type_avion_id(id, nom, code_oaci)')
      .order('aeroport_actuel')
      .order('created_at', { ascending: false }),
    admin.from('siavi_hubs')
      .select('*')
      .order('is_principal', { ascending: false })
      .order('created_at'),
    admin.from('siavi_config').select('*').eq('id', 1).single(),
    admin.from('felitz_comptes').select('id, solde, vban').eq('type', 'siavi').single(),
  ]);

  const STATUT_LABELS: Record<string, { label: string; color: string }> = {
    ground: { label: 'Au sol', color: 'text-emerald-700 bg-emerald-100' },
    in_flight: { label: 'En vol', color: 'text-sky-700 bg-sky-100' },
    bloque: { label: 'Bloqué', color: 'text-red-700 bg-red-100' },
    en_reparation: { label: 'En réparation', color: 'text-amber-700 bg-amber-100' },
    maintenance: { label: 'Maintenance', color: 'text-orange-700 bg-orange-100' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-700 to-rose-800 p-6 shadow-xl">
        <div className="relative flex items-center gap-4">
          <Link href="/siavi" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </Link>
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur">
            <Plane className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Flotte SIAVI</h1>
            <p className="text-red-100/80 text-sm">{(avions || []).length} appareil(s)</p>
          </div>
          {compteSiavi && (
            <div className="text-right">
              <p className="text-xs text-red-200">Solde SIAVI</p>
              <p className="text-xl font-bold text-white">{Number(compteSiavi.solde).toLocaleString('fr-FR')} F$</p>
            </div>
          )}
        </div>
      </div>

      {/* Hubs */}
      <div className="rounded-xl bg-white border border-red-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-red-900 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-red-600" />
          Hubs SIAVI
        </h2>
        {(!hubs || hubs.length === 0) ? (
          <p className="text-sm text-red-600 italic">Aucun hub SIAVI. {isChef ? 'Ajoutez-en un ci-dessous.' : 'Le Chef de brigade doit en créer un.'}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {hubs.map(h => (
              <span key={h.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono font-bold ${h.is_principal ? 'bg-red-100 text-red-800 border-2 border-red-400' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                <MapPin className="h-3.5 w-3.5" />
                {h.aeroport_oaci}
                {h.is_principal && <span className="text-xs font-normal ml-1">(principal)</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Avions */}
      <div className="rounded-xl bg-white border border-red-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-red-900 mb-4 flex items-center gap-2">
          <Plane className="h-5 w-5 text-red-600" />
          Appareils
        </h2>
        {(!avions || avions.length === 0) ? (
          <div className="text-center py-8">
            <Plane className="h-12 w-12 text-red-300 mx-auto mb-3" />
            <p className="text-red-600">Aucun appareil dans la flotte</p>
            {isChef && <p className="text-red-500 text-sm mt-1">Achetez des avions depuis la marketplace</p>}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {avions.map(a => {
              const ta = Array.isArray(a.types_avion) ? a.types_avion[0] : a.types_avion;
              const st = STATUT_LABELS[a.statut] || { label: a.statut, color: 'text-slate-700 bg-slate-100' };
              return (
                <div key={a.id} className="p-4 rounded-lg border border-red-200 bg-red-50/50 hover:bg-red-50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-red-900">{a.immatriculation}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${st.color}`}>{st.label}</span>
                  </div>
                  <p className="text-sm text-slate-700">{ta?.nom || 'Type inconnu'}</p>
                  {a.nom_personnalise && <p className="text-xs text-slate-500 italic">{a.nom_personnalise}</p>}
                  <div className="flex items-center justify-between mt-2 text-xs text-slate-600">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{a.aeroport_actuel}</span>
                    <span className="flex items-center gap-1">
                      <Wrench className="h-3 w-3" />
                      {Number(a.usure_percent)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions Chef de brigade */}
      {isChef && (
        <FlotteSiaviClient
          config={config || { pourcentage_salaire_pilote: 40 }}
          compteSolde={Number(compteSiavi?.solde || 0)}
        />
      )}
    </div>
  );
}
