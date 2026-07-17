import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import {
  Lock, Link2, Settings2, IdCard, Building2, Crown, Briefcase, Clock,
  Plane, ArrowRightLeft, CheckCircle2, TrendingUp, Users, RefreshCw
} from 'lucide-react';
import CompteForm from './CompteForm';
import LicencesSection from '@/components/LicencesSection';
import MaCartePhoto from './MaCartePhoto';
import MonLogoSelector from '@/components/MonLogoSelector';
import RadarBetaSection from '@/components/RadarBetaSection';
import DiscordLinkSection from '@/components/DiscordLinkSection';
import RobloxUsernameSection from '@/components/RobloxUsernameSection';
import CompteHeader from './CompteHeader';
import Link from 'next/link';

export default async function ComptePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

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

  // Carte d'identite, Discord, compagnies, activité — tout en parallèle
  const [
    carteRes, discordRes, emploisRes, compagniesPdgRes,
    volsRecentsRes, comptePersoRes
  ] = await Promise.all([
    admin.from('cartes_identite').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('discord_links').select('discord_user_id').eq('user_id', user.id).maybeSingle(),
    admin.from('compagnie_employes')
      .select('compagnie_id, role, compagnies(id, nom)')
      .eq('pilote_id', user.id),
    admin.from('compagnies')
      .select('id, nom')
      .eq('pdg_id', user.id),
    admin.from('vols')
      .select('id, depart_utc, aeroport_depart, aeroport_arrivee, duree_minutes, type_avion:types_avion(nom)')
      .or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id}`)
      .eq('statut', 'validé')
      .order('depart_utc', { ascending: false })
      .limit(5),
    admin.from('felitz_comptes')
      .select('id, solde')
      .eq('proprietaire_id', user.id)
      .eq('type', 'personnel')
      .maybeSingle(),
  ]);

  const carte = carteRes.data ?? null;
  const discordLie = Boolean(discordRes.data?.discord_user_id);

  // Compagnies du pilote
  type CompagnieRole = { id: string; nom: string; role: 'pdg' | 'co_pdg' | 'employe' };
  const compagniesMap = new Map<string, CompagnieRole>();

  (emploisRes.data || []).forEach(e => {
    const c = e.compagnies;
    const cObj = c ? (Array.isArray(c) ? c[0] : c) as { id: string; nom: string } : null;
    if (cObj && !compagniesMap.has(cObj.id)) {
      compagniesMap.set(cObj.id, { ...cObj, role: e.role === 'co_pdg' ? 'co_pdg' : 'employe' });
    }
  });
  (compagniesPdgRes.data || []).forEach(c => {
    compagniesMap.set(c.id, { ...c, role: 'pdg' });
  });
  const mesCompagnies = Array.from(compagniesMap.values());

  // Transactions récentes (compte personnel seulement)
  let dernieresTransactions: Array<{ id: string; type: string; montant: number; libelle: string; created_at: string }> = [];
  if (comptePersoRes.data?.id) {
    const { data: txData } = await admin.from('felitz_transactions')
      .select('id, type, montant, libelle, created_at')
      .eq('compte_id', comptePersoRes.data.id)
      .order('created_at', { ascending: false })
      .limit(5);
    dernieresTransactions = (txData || []).map(t => ({
      id: t.id as string,
      type: t.type as string,
      montant: t.montant as number,
      libelle: (t.libelle as string) || '',
      created_at: t.created_at as string,
    }));
  }

  const volsRecents = (volsRecentsRes.data || []).map(v => ({
    id: v.id,
    depart_utc: v.depart_utc,
    aeroport_depart: v.aeroport_depart,
    aeroport_arrivee: v.aeroport_arrivee,
    duree_minutes: v.duree_minutes,
    type_avion_nom: (v.type_avion ? (Array.isArray(v.type_avion) ? v.type_avion[0] : v.type_avion) as { nom: string } : null)?.nom ?? null,
  }));

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
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
        photoUrl={(carte as { photo_url?: string | null } | null)?.photo_url ?? null}
      />

      {/* ── Grille principale ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(300px,340px)] gap-6 items-start">
        {/* Colonne droite : carte d'identité */}
        <aside className="lg:order-2 lg:sticky lg:top-20 space-y-3 self-start">
          <div className="flex items-center gap-2 text-slate-300">
            <IdCard className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Ma carte d&apos;identité</h2>
          </div>
          <MaCartePhoto
            initialCarte={carte}
            identifiant={profile?.identifiant ?? '—'}
            embedLogoSelector={false}
          />
        </aside>

        {/* Colonne gauche */}
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

          <Section title="Personnalisation de la carte" Icon={IdCard} description="Choisis le logo de la compagnie affiché sur ta carte d'identité (parmi celles auxquelles tu es rattaché).">
            <MonLogoSelector />
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

      {/* ── Mes compagnies ── */}
      {mesCompagnies.length > 0 && (
        <Section title="Mes compagnies" Icon={Building2} description="Compagnies auxquelles vous êtes rattaché en tant que PDG, co-PDG ou employé.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mesCompagnies.map(c => {
              const roleConfig =
                c.role === 'pdg'    ? { label: 'PDG',     Icon: Crown,    color: 'text-amber-300 bg-amber-500/15 ring-amber-500/30' } :
                c.role === 'co_pdg' ? { label: 'Co-PDG',  Icon: Users,    color: 'text-sky-300   bg-sky-500/15   ring-sky-500/30' }   :
                                      { label: 'Employé', Icon: Briefcase, color: 'text-slate-300 bg-slate-700/60 ring-slate-600/40' };
              const RoleIcon = roleConfig.Icon;
              return (
                <Link
                  key={c.id}
                  href="/ma-compagnie"
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:border-sky-500/40 hover:bg-slate-800 transition-all group"
                >
                  <div className="h-10 w-10 rounded-lg bg-sky-500/15 ring-1 ring-sky-500/30 flex items-center justify-center shrink-0 group-hover:ring-sky-500/50 transition-all">
                    <Building2 className="h-5 w-5 text-sky-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-100 truncate">{c.nom}</p>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ring-1 mt-0.5 ${roleConfig.color}`}>
                      <RoleIcon className="h-3 w-3" />
                      {roleConfig.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Activité récente ── */}
      <Section title="Activité récente" Icon={Clock} description="Vos 5 derniers vols validés et transactions Felitz personnelles.">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Derniers vols */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Plane className="h-4 w-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-slate-200">Derniers vols validés</h3>
              <Link href="/logbook" className="ml-auto text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                Voir tout <TrendingUp className="h-3 w-3" />
              </Link>
            </div>
            {volsRecents.length === 0 ? (
              <div className="card text-center py-6">
                <Plane className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Aucun vol validé</p>
              </div>
            ) : (
              <div className="space-y-2">
                {volsRecents.map(vol => {
                  const duree = vol.duree_minutes
                    ? `${Math.floor(vol.duree_minutes / 60)}h${(vol.duree_minutes % 60).toString().padStart(2, '0')}`
                    : null;
                  return (
                    <Link
                      key={vol.id}
                      href="/logbook"
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/40 hover:border-sky-500/30 hover:bg-slate-800 transition-all group"
                    >
                      <div className="h-8 w-8 rounded-lg bg-sky-500/15 ring-1 ring-sky-500/25 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-sky-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">
                          {vol.aeroport_depart} → {vol.aeroport_arrivee}
                        </p>
                        <p className="text-xs text-slate-500">
                          {vol.type_avion_nom && <span className="text-slate-400">{vol.type_avion_nom} · </span>}
                          {vol.depart_utc && new Date(vol.depart_utc).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                      {duree && (
                        <span className="text-xs text-slate-500 font-mono shrink-0 flex items-center gap-1">
                          <Clock className="h-3 w-3" />{duree}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dernières transactions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-200">Transactions personnelles</h3>
              <Link href="/felitz-bank" className="ml-auto text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                Voir tout <TrendingUp className="h-3 w-3" />
              </Link>
            </div>
            {dernieresTransactions.length === 0 ? (
              <div className="card text-center py-6">
                <ArrowRightLeft className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Aucune transaction</p>
              </div>
            ) : (
              <div className="space-y-2">
                {dernieresTransactions.map(tx => {
                  const isCredit = tx.type === 'credit' || tx.montant > 0;
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/40"
                    >
                      <div className={`h-8 w-8 rounded-lg ring-1 flex items-center justify-center shrink-0 ${
                        isCredit
                          ? 'bg-emerald-500/15 ring-emerald-500/25'
                          : 'bg-red-500/15 ring-red-500/25'
                      }`}>
                        <RefreshCw className={`h-4 w-4 ${isCredit ? 'text-emerald-400' : 'text-red-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-400 truncate">{tx.libelle || tx.type}</p>
                        <p className="text-[10px] text-slate-500">
                          {new Date(tx.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={`text-sm font-bold tabular-nums shrink-0 ${isCredit ? 'text-emerald-300' : 'text-red-300'}`}>
                        {isCredit ? '+' : ''}{tx.montant.toLocaleString('fr-FR')} F$
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Section>
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
