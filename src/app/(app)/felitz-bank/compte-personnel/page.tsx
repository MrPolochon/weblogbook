import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ComptePersonnelFelitz from './ComptePersonnelFelitz';

export default async function ComptePersonnelFelitzPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: compte } = await supabase
    .from('felitz_comptes')
    .select('id, vban, solde')
    .eq('user_id', user.id)
    .eq('type_compte', 'personnel')
    .single();

  const { data: transactions } = compte
    ? await supabase
        .from('felitz_transactions')
        .select('id, type, montant, titre, description, created_at')
        .eq('compte_id', compte.id)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: null };

  const { data: virements } = compte
    ? await supabase
        .from('felitz_virements')
        .select('id, compte_destinataire_vban, montant, libelle, created_at')
        .eq('compte_emetteur_id', compte.id)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: null };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100">Felitz Bank — Compte personnel</h1>
      <ComptePersonnelFelitz
        compte={compte}
        transactions={transactions || []}
        virements={virements || []}
        userId={user.id}
      />
    </div>
  );
}
