import { Crown, Plane, Headphones, Flame, ShieldCheck, Mail, MessageSquare, Gamepad2, Award, CheckCircle2, AlertCircle } from 'lucide-react';

type Role = 'admin' | 'pilote' | 'atc' | 'controleur' | 'siavi' | 'instructeur' | string;

type Props = {
  identifiant: string;
  role: Role | null;
  flags: {
    armee: boolean;
    ifsa: boolean;
    atc: boolean;
    siavi: boolean;
  };
  status: {
    emailRenseigne: boolean;
    discordLie: boolean;
    robloxRenseigne: boolean;
  };
};

const ROLE_META: Record<string, { label: string; Icon: typeof Crown; classes: string }> = {
  admin: { label: 'Administrateur', Icon: Crown, classes: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  atc: { label: 'Contrôleur ATC', Icon: Headphones, classes: 'bg-orange-500/15 text-orange-300 border-orange-500/40' },
  controleur: { label: 'Contrôleur ATC', Icon: Headphones, classes: 'bg-orange-500/15 text-orange-300 border-orange-500/40' },
  siavi: { label: 'SIAVI', Icon: Flame, classes: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
  ifsa: { label: 'IFSA', Icon: ShieldCheck, classes: 'bg-violet-500/15 text-violet-300 border-violet-500/40' },
  instructeur: { label: 'Instructeur', Icon: Award, classes: 'bg-sky-500/15 text-sky-300 border-sky-500/40' },
  pilote: { label: 'Pilote', Icon: Plane, classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
};

function getInitials(identifiant: string): string {
  const parts = identifiant.trim().split(/[\s_.-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CompteHeader({ identifiant, role, flags, status }: Props) {
  const initials = getInitials(identifiant);

  const badges: Array<{ key: string; label: string; Icon: typeof Crown; classes: string }> = [];
  if (role && ROLE_META[role]) {
    const m = ROLE_META[role];
    badges.push({ key: `role-${role}`, label: m.label, Icon: m.Icon, classes: m.classes });
  }
  if (flags.atc && role !== 'atc' && role !== 'controleur') {
    const m = ROLE_META.atc!;
    badges.push({ key: 'atc', label: m.label, Icon: m.Icon, classes: m.classes });
  }
  if (flags.siavi && role !== 'siavi') {
    const m = ROLE_META.siavi!;
    badges.push({ key: 'siavi', label: m.label, Icon: m.Icon, classes: m.classes });
  }
  if (flags.ifsa) {
    const m = ROLE_META.ifsa!;
    badges.push({ key: 'ifsa', label: m.label, Icon: m.Icon, classes: m.classes });
  }
  if (flags.armee) {
    badges.push({
      key: 'armee',
      label: 'Armée',
      Icon: ShieldCheck,
      classes: 'bg-slate-700/40 text-slate-200 border-slate-500/40',
    });
  }
  if (badges.length === 0) {
    const m = ROLE_META.pilote!;
    badges.push({ key: 'pilote-default', label: m.label, Icon: m.Icon, classes: m.classes });
  }

  const indicators = [
    { key: 'email', label: 'Adresse email', Icon: Mail, ok: status.emailRenseigne, helpOk: 'Renseignée', helpKo: 'Manquante' },
    { key: 'discord', label: 'Discord', Icon: MessageSquare, ok: status.discordLie, helpOk: 'Lié', helpKo: 'Non lié' },
    { key: 'roblox', label: 'Roblox', Icon: Gamepad2, ok: status.robloxRenseigne, helpOk: 'Renseigné', helpKo: 'Non renseigné' },
  ];

  const completion = indicators.filter((i) => i.ok).length;
  const total = indicators.length;
  const pct = Math.round((completion / total) * 100);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/70 via-slate-900/60 to-slate-950/80 p-5 sm:p-6 shadow-xl">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 text-2xl sm:text-3xl font-bold text-white shadow-lg ring-2 ring-white/10">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">Identifiant pilote</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 leading-tight truncate">{identifiant}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <span
                  key={b.key}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${b.classes}`}
                >
                  <b.Icon className="h-3 w-3" />
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-medium text-slate-300">Compte complété à {pct}%</span>
            <span className="text-slate-500">·</span>
            <span>{completion}/{total}</span>
          </div>
          <div className="h-1.5 w-full sm:w-56 rounded-full bg-slate-700/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-violet-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {indicators.map((ind) => (
              <span
                key={ind.key}
                title={`${ind.label} : ${ind.ok ? ind.helpOk : ind.helpKo}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${
                  ind.ok
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}
              >
                {ind.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                <ind.Icon className="h-3 w-3" />
                {ind.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
