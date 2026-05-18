'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink } from 'lucide-react';

/**
 * Bandeau d'avertissement affiche sur le formulaire de depot de plan de vol
 * lorsqu'un (ou les deux) aeroports selectionnes ont au moins un NOTAM
 * **actuellement actif** (entre `du_at` et `au_at`, ou permanent après `du_at`, non annule).
 *
 * Volontairement compact :
 *  - une seule requete vers /api/notams au montage (renvoie tous les NOTAMs
 *    visibles par l'utilisateur ; le filtrage par aeroport et par statut se
 *    fait cote client) ;
 *  - rien ne s'affiche tant qu'aucun aeroport n'est selectionne ou qu'aucun
 *    NOTAM actif n'existe sur ces aeroports.
 */

type NotamRow = {
  id: string;
  identifiant: string;
  code_aeroport: string;
  du_at: string;
  au_at: string;
  permanent?: boolean | null;
  champ_e: string;
  annule: boolean;
};

export default function NotamsAirportWarning({
  aeroportDepart,
  aeroportArrivee,
}: {
  aeroportDepart: string;
  aeroportArrivee: string;
}) {
  const [notams, setNotams] = useState<NotamRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notams', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const list: NotamRow[] = Array.isArray(data) ? data : Array.isArray(data?.notams) ? data.notams : [];
        if (!cancelled) setNotams(list);
      } catch {
        if (!cancelled) setNotams([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const actifsParAeroport = useMemo(() => {
    const result = new Map<string, NotamRow[]>();
    if (!notams) return result;
    const now = Date.now();
    const codes = new Set<string>();
    if (aeroportDepart) codes.add(aeroportDepart.toUpperCase());
    if (aeroportArrivee) codes.add(aeroportArrivee.toUpperCase());
    if (codes.size === 0) return result;
    for (const n of notams) {
      if (n.annule) continue;
      const code = (n.code_aeroport || '').toUpperCase();
      if (!codes.has(code)) continue;
      const du = new Date(n.du_at).getTime();
      const au = new Date(n.au_at).getTime();
      if (Number.isNaN(du) || Number.isNaN(au)) continue;
      if (now < du || (!n.permanent && now > au)) continue;
      let arr = result.get(code);
      if (!arr) { arr = []; result.set(code, arr); }
      arr.push(n);
    }
    return result;
  }, [notams, aeroportDepart, aeroportArrivee]);

  if (actifsParAeroport.size === 0) return null;

  const blocs: Array<{ code: string; role: string; items: NotamRow[] }> = [];
  const depCode = aeroportDepart.toUpperCase();
  const arrCode = aeroportArrivee.toUpperCase();
  if (depCode && actifsParAeroport.has(depCode)) {
    blocs.push({ code: depCode, role: 'Depart', items: actifsParAeroport.get(depCode) || [] });
  }
  if (arrCode && arrCode !== depCode && actifsParAeroport.has(arrCode)) {
    blocs.push({ code: arrCode, role: 'Arrivee', items: actifsParAeroport.get(arrCode) || [] });
  }
  const total = blocs.reduce((s, b) => s + b.items.length, 0);

  return (
    <div
      className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 animate-fade-in"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-amber-200">
              {total} NOTAM{total > 1 ? 's' : ''} actif{total > 1 ? 's' : ''} sur votre route
            </p>
            <Link
              href="/notams"
              target="_blank"
              className="text-xs text-amber-200/80 hover:text-amber-100 inline-flex items-center gap-1 underline decoration-dotted"
            >
              Voir tous les NOTAMs <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {blocs.map((b) => (
            <div key={b.code} className="space-y-1.5">
              <p className="text-xs uppercase tracking-wide text-amber-300/80 font-semibold">
                {b.role} — {b.code} <span className="text-amber-300/50">({b.items.length})</span>
              </p>
              <ul className="space-y-1">
                {b.items.map((n) => (
                  <li
                    key={n.id}
                    className="text-xs text-amber-100/90 bg-amber-500/5 border border-amber-500/20 rounded-md px-2.5 py-1.5"
                  >
                    <span className="font-mono text-amber-300/90 mr-2">{n.identifiant}</span>
                    <span className="whitespace-pre-line">{(n.champ_e || '').trim() || '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="text-[11px] text-amber-200/70 italic">
            Verifiez ces informations avant de deposer votre plan de vol.
          </p>
        </div>
      </div>
    </div>
  );
}
