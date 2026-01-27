import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FilePlus } from 'lucide-react';
import CreerPlanAtcForm from './CreerPlanAtcForm';

export default async function CreerPlanAtcPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Vérifier que l'ATC est en service
  const { data: session } = await supabase
    .from('atc_sessions')
    .select('aeroport, position')
    .eq('user_id', user.id)
    .single();

  if (!session) {
    redirect('/atc');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/atc" className="p-2 rounded-lg bg-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-300 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <FilePlus className="h-7 w-7 text-emerald-600" />
            Créer un plan de vol
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Créez un plan de vol pour un pilote depuis votre position {session.position} à {session.aeroport}
          </p>
        </div>
      </div>

      <CreerPlanAtcForm 
        sessionAeroport={session.aeroport} 
        sessionPosition={session.position} 
      />
    </div>
  );
}
