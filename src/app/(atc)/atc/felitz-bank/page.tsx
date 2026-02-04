import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Landmark, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import FelitzBankAtcClient from './FelitzBankAtcClient';

export default async function FelitzBankAtcPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role, atc, identifiant').eq('id', user.id).single();
  const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || profile?.atc;
  if (!canAtc) redirect('/logbook');

  const admin = createAdminClient();

  // Compte personnel
  const { data: comptePerso } = await admin.from('felitz_comptes')
    .select('*')
    .eq('proprietaire_id', user.id)
    .eq('type', 'personnel')
    .single();

  // Transactions récentes pour le compte personnel
  let transactionsPerso: Array<{ id: string; type: string; montant: number; libelle: string; description?: string | null; created_at: string }> = [];
  if (comptePerso) {
    const { data } = await admin.from('felitz_transactions')
      .select('id, type, montant, libelle, description, created_at')
      .eq('compte_id', comptePerso.id)
      .order('created_at', { ascending: false })
      .limit(20);
    transactionsPerso = data || [];
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
        <div className="relative flex items-center gap-4">
          <Link href="/atc" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </Link>
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur">
            <Landmark className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Felitz Bank</h1>
            <p className="text-emerald-100/80 text-sm">Votre compte personnel</p>
          </div>
        </div>
      </div>

      {/* Compte Personnel */}
      <div className="rounded-xl bg-white border border-emerald-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Landmark className="h-5 w-5 text-emerald-600" />
          Compte Personnel
        </h2>
        
        {comptePerso ? (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <p className="text-sm text-slate-500">VBAN</p>
              <p className="font-mono text-slate-800 text-sm break-all">{comptePerso.vban}</p>
            </div>
            
            <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
              <p className="text-sm text-emerald-600">Solde disponible</p>
              <p className="text-3xl font-bold text-emerald-700">
                {comptePerso.solde.toLocaleString('fr-FR')} F$
              </p>
            </div>

            <FelitzBankAtcClient 
              compteId={comptePerso.id}
              solde={comptePerso.solde}
              transactions={transactionsPerso}
            />
          </div>
        ) : (
          <p className="text-slate-500">Aucun compte personnel trouvé.</p>
        )}
      </div>
    </div>
  );
}
