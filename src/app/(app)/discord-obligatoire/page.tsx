import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DiscordLinkSection from '@/components/DiscordLinkSection';

export const dynamic = 'force-dynamic';

export default async function DiscordRequiredPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="card">
        <h1 className="text-2xl font-semibold text-slate-100">Liaison Discord obligatoire</h1>
        <p className="mt-2 text-sm text-slate-400">
          Pour accéder au site, ton compte doit maintenant être relié à un compte Discord valide du serveur officiel.
          Si le bot détecte une sanction temporaire, l’accès reste bloqué jusqu’à la fin de cette sanction.
        </p>
      </div>
      <DiscordLinkSection mandatoryFlow />
    </div>
  );
}
