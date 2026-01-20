type Notam = {
  id: string;
  identifiant: string;
  code_aeroport: string;
  du_at: string;
  au_at: string;
  champ_a: string | null;
  champ_e: string;
  champ_d: string | null;
  champ_q: string | null;
  priorite: string | null;
  reference_fr: string | null;
  annule: boolean;
};

function formatDUAU(iso: string): string {
  const d = new Date(iso);
  const j = String(d.getUTCDate()).padStart(2, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const a = d.getUTCFullYear();
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${j} ${m} ${a} ${h}:${min}`;
}

export default function NotamCard({ n, variant = 'default', adminDeleteButton }: { n: Notam; variant?: 'default' | 'atc'; adminDeleteButton?: React.ReactNode }) {
  const now = Date.now();
  const du = new Date(n.du_at).getTime();
  const au = new Date(n.au_at).getTime();
  const actif = !n.annule && now >= du && now <= au;
  const expire = !n.annule && now > au;
  const aVenir = !n.annule && now < du;

  const text = variant === 'atc' ? 'text-slate-800' : 'text-slate-300';
  const textLabel = variant === 'atc' ? 'text-slate-600' : 'text-slate-500';
  const cardBg = variant === 'atc' ? 'bg-white border-slate-200' : 'border-slate-700/50 bg-slate-800/20';

  return (
    <article className={`rounded-lg border p-4 ${cardBg}`}>
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded ${
            n.annule ? 'bg-slate-400' : actif ? 'bg-violet-500' : expire ? 'bg-slate-500' : 'bg-slate-400'
          }`}
          title={n.annule ? 'Annulé' : actif ? 'En vigueur' : expire ? 'Expiré' : 'À venir'}
        >
          {!n.annule && actif ? (
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : null}
        </div>
        <div className={`min-w-0 flex-1 space-y-1 text-sm ${text}`}>
          <p className="font-mono font-semibold">{n.identifiant}</p>
          <p>
            <span className={textLabel}>DU: </span>{formatDUAU(n.du_at)}
            <span className={`ml-2 ${textLabel}`}>AU: </span>{formatDUAU(n.au_at)}
          </p>
          {n.champ_a && (
            <p><span className={textLabel}>A) </span>{n.champ_a}</p>
          )}
          {n.champ_q && (
            <p><span className={textLabel}>Q) </span><span className="font-mono text-xs">{n.champ_q}</span></p>
          )}
          {n.champ_d && (
            <p><span className={textLabel}>D) </span>{n.champ_d}</p>
          )}
          <p><span className={textLabel}>E) </span>{n.champ_e}</p>
          {n.reference_fr && (
            <p className={`text-xs ${textLabel}`}>Version française : {n.reference_fr}</p>
          )}
          {n.annule && <p className="text-amber-500 font-medium">— ANNULÉ —</p>}
          {!n.annule && expire && <p className="text-slate-500 text-xs">— Expiré —</p>}
          {!n.annule && aVenir && <p className="text-slate-500 text-xs">— À venir —</p>}
        </div>
        {adminDeleteButton && <div className="flex-shrink-0">{adminDeleteButton}</div>}
      </div>
    </article>
  );
}
