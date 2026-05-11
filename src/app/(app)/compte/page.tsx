import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Lock, Link2, Settings2, IdCard } from 'lucide-react';
import CompteForm from './CompteForm';
import LicencesSection from '@/components/LicencesSection';
import MaCartePhoto from './MaCartePhoto';
import RadarBetaSection from '@/components/RadarBetaSection';
import DiscordLinkSection from '@/components/DiscordLinkSection';
import RobloxUsernameSection from '@/components/RobloxUsernameSection';
import CompteHeader from './CompteHeader';

export default async function ComptePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // On utilise l'admin client pour bypass RLS / colonnes non lisibles par anon ;
  // resilient : si une colonne n'existe pas dans certains environnements, on
  // retombe sur un select minimal pour ne pas vider tout le header.
  type Profile = {
    identifiant: string | null;
    role: string | null;
    armee: boolean | null;
    email: string | null;
    ifsa: boolean | null;
    atc: boolean | null;
    siavi: boolean | null;
    roblox_username: string | null;
  };
  let profile: Profile | null = null;

  const profileFull = await admin
    .from('profiles')
    .select('identifiant, role, armee, email, ifsa, atc, siavi, roblox_username')
    .eq('id', user.id)
    .maybeSingle();

  if (profileFull.data) {
    profile = profileFull.data as unknown as Profile;
  } else {
    const profileMin = await admin
      .from('profiles')
      .select('identifiant, role, armee, email')
      .eq('id', user.id)
      .maybeSingle();
    profile = profileMin.data
      ? { ...(profileMin.data as Pick<Profile, 'identifiant' | 'role' | 'armee' | 'email'>), ifsa: null, atc: null, siavi: null, roblox_username: null }
      : null;
  }

  // Carte d'identite + statut Discord en parallele
  const [carteRes, discordRes] = await Promise.all([
    admin.from('cartes_identite').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('discord_links').select('discord_user_id').eq('user_id', user.id).maybeSingle(),
  ]);
  const carte = carteRes.data ?? null;
  const discordLie = Boolean(discordRes.data?.discord_user_id);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <CompteHeader
        identifiant={profile?.identifiant ?? '—'}
        role={profile?.role ?? null}
        flags={{
          armee: Boolean(profile?.armee),
          ifsa: Boolean(profile?.ifsa),
          atc: Boolean(profile?.atc),
          siavi: Boolean(profile?.siavi),
        }}
        status={{
          emailRenseigne: Boolean(profile?.email),
          discordLie,
          robloxRenseigne: Boolean(profile?.roblox_username),
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,360px)] gap-6 items-start">
        {/* Colonne droite (DOM-first pour mobile) : carte d'identite */}
        <aside className="lg:order-2 lg:sticky lg:top-20 space-y-3">
          <div className="flex items-center gap-2 text-slate-300">
            <IdCard className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Ma carte d&apos;identité</h2>
          </div>
          <MaCartePhoto initialCarte={carte} identifiant={profile?.identifiant ?? '—'} />
        </aside>

        {/* Colonne gauche : sections de configuration */}
        <div className="space-y-8 min-w-0 lg:order-1">
          <Section title="Identité & connexions" Icon={Link2} description="Adresse email, liaison Discord et pseudo Roblox utilisés pour vous identifier sur le site et le radar.">
            <CompteForm
              armee={Boolean(profile?.armee)}
              isAdmin={profile?.role === 'admin'}
              initialEmail={profile?.email ?? ''}
              showOnlyEmail
            />
            <DiscordLinkSection variant="default" />
            <RobloxUsernameSection variant="default" />
          </Section>

          <Section title="Sécurité" Icon={Lock} description="Mot de passe et accès privilégiés liés à votre compte.">
            <CompteForm
              armee={Boolean(profile?.armee)}
              isAdmin={profile?.role === 'admin'}
              initialEmail={profile?.email ?? ''}
              showOnlyPassword
            />
          </Section>

          <Section title="Outils & accès" Icon={Settings2} description="Radar ATC, qualifications et licences.">
            <RadarBetaSection variant="default" />
            <LicencesSection userId={user.id} variant="default" />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  Icon,
  children,
}: {
  title: string;
  description?: string;
  Icon: typeof Lock;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <header className="border-l-2 border-sky-500/50 pl-3 sm:pl-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <Icon className="h-5 w-5 text-sky-400" />
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
