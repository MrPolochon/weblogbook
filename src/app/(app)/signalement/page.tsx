import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { AlertTriangle, ArrowLeft, FileText, Send } from 'lucide-react';
import Link from 'next/link';
import SignalementClient from './SignalementClient';

export default async function SignalementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Récupérer les signalements de l'utilisateur
  const { data: mesSignalements } = await admin.from('ifsa_signalements')
    .select(`
      id,
      numero_signalement,
      type_signalement,
      titre,
      statut,
      created_at,
      reponse_ifsa
    `)
    .eq('signale_par_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Récupérer la liste des pilotes et compagnies pour le formulaire
  const { data: pilotes } = await admin.from('profiles')
    .select('id, identifiant')
    .neq('id', user.id)
    .order('identifiant')
    .limit(100);

  const { data: compagnies } = await admin.from('compagnies')
    .select('id, nom')
    .order('nom');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-600 via-orange-700 to-red-800 p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
        <div className="relative flex items-center gap-4">
          <Link href="/logbook" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </Link>
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur">
            <AlertTriangle className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Signalement IFSA</h1>
            <p className="text-orange-100/80 text-sm">Signaler un incident ou une infraction</p>
          </div>
        </div>
      </div>

      {/* Information */}
      <div className="card bg-amber-500/10 border-amber-500/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-200 font-medium">Qu&apos;est-ce que l&apos;IFSA ?</p>
            <p className="text-sm text-amber-300/80 mt-1">
              L&apos;IFSA (International Flight Safety Authority) est l&apos;autorité de régulation 
              de l&apos;aviation sur notre serveur. Elle traite les signalements, mène des enquêtes 
              et peut émettre des sanctions en cas d&apos;infraction.
            </p>
          </div>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-400/80 text-sm">Mes signalements</p>
              <p className="text-2xl font-bold text-blue-400">{(mesSignalements || []).length}</p>
            </div>
            <FileText className="h-8 w-8 text-blue-400/30" />
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-400/80 text-sm">En cours de traitement</p>
              <p className="text-2xl font-bold text-emerald-400">
                {(mesSignalements || []).filter(s => !['classe', 'rejete'].includes(s.statut)).length}
              </p>
            </div>
            <Send className="h-8 w-8 text-emerald-400/30" />
          </div>
        </div>
      </div>

      <SignalementClient
        mesSignalements={mesSignalements || []}
        pilotes={pilotes || []}
        compagnies={compagnies || []}
      />
    </div>
  );
}
