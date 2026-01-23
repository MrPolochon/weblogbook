import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Building2, Wallet, Briefcase } from 'lucide-react';

export default async function FelitzBankPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/atc');

  const [{ data: comptePersonnel }, { data: compagniesPDG }] = await Promise.all([
    supabase.from('felitz_comptes').select('id, vban, solde').eq('user_id', user.id).is('compagnie_id', null).single(),
    supabase.from('compagnies').select('id, nom, pdg_id').eq('pdg_id', user.id),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
        <Building2 className="h-6 w-6" />
        Felitz Bank
      </h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/felitz/compte-personnel"
          className="card flex items-center gap-4 hover:border-sky-500/50 transition-colors"
        >
          <Wallet className="h-8 w-8 text-sky-400" />
          <div>
            <h2 className="font-medium text-slate-200">Compte personnel</h2>
            <p className="text-sm text-slate-400">
              {comptePersonnel ? `VBAN: ${comptePersonnel.vban}` : 'Créer un compte'}
            </p>
          </div>
        </Link>

        {compagniesPDG && compagniesPDG.length > 0 && (
          <Link
            href="/felitz/compte-pdg"
            className="card flex items-center gap-4 hover:border-sky-500/50 transition-colors"
          >
            <Briefcase className="h-8 w-8 text-sky-400" />
            <div>
              <h2 className="font-medium text-slate-200">Compte PDG</h2>
              <p className="text-sm text-slate-400">
                {compagniesPDG.length} compagnie{compagniesPDG.length > 1 ? 's' : ''}
              </p>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
