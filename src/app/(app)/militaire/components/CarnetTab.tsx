'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Filter, Plane } from 'lucide-react';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import { formatDuree } from '@/lib/utils';
import VolDeleteButton from '@/components/VolDeleteButton';
import type { VolMilitaireRow } from '../types';
import { LIB_STATUT, libNatureVol, libEscadrille, roleUtilisateurSurVol } from '../lib/militaire-labels';

type FilterStatut = 'tous' | 'en_attente' | 'validé' | 'refusé';

type Props = {
  vols: VolMilitaireRow[];
  userId: string;
};

export default function CarnetTab({ vols, userId }: Props) {
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<FilterStatut>('tous');

  const filtered = useMemo(() => {
    let list = vols;
    if (filterStatut !== 'tous') {
      list = list.filter((v) => v.statut === filterStatut);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((v) =>
        (v.aeroport_depart || '').toLowerCase().includes(q) ||
        (v.aeroport_arrivee || '').toLowerCase().includes(q) ||
        (v.type_avion_militaire || '').toLowerCase().includes(q) ||
        (v.callsign || '').toLowerCase().includes(q) ||
        libNatureVol(v.nature_vol_militaire, v.nature_vol_militaire_autre).toLowerCase().includes(q)
      );
    }
    return list;
  }, [vols, search, filterStatut]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="search"
            placeholder="Rechercher (aéroport, appareil, callsign…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500 shrink-0" />
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value as FilterStatut)}
            className="input min-w-[140px]"
          >
            <option value="tous">Tous les statuts</option>
            <option value="en_attente">En attente</option>
            <option value="validé">Validés</option>
            <option value="refusé">Refusés</option>
          </select>
        </div>
        <Link href="/militaire/nouveau" className="btn-primary inline-flex items-center justify-center gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Nouveau vol
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/50 bg-slate-800/20 py-16 text-center">
          <Plane className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">
            {vols.length === 0 ? 'Aucun vol militaire enregistré.' : 'Aucun vol ne correspond à votre recherche.'}
          </p>
          {vols.length === 0 && (
            <Link href="/militaire/nouveau" className="inline-flex mt-4 text-sm text-red-400 hover:text-red-300">
              Déposer votre premier vol →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => {
            const statut = LIB_STATUT[v.statut] || LIB_STATUT.en_attente;
            const canDelete = v.pilote_id === userId || v.copilote_id === userId || v.chef_escadron_id === userId;
            return (
              <article
                key={v.id}
                className="group rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 hover:border-slate-600/50 transition-all duration-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Link
                        href={`/militaire/vol/${v.id}`}
                        className="text-sm font-semibold text-slate-100 hover:text-red-300 transition-colors"
                      >
                        {formatDateMediumUTC(v.depart_utc)}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statut.bg} ${statut.color}`}>
                        {statut.label}
                      </span>
                      {v.mission_id && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300">
                          Mission
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300">
                      <span className="font-mono text-sky-300">{v.aeroport_depart || '—'}</span>
                      <span className="text-slate-600 mx-2">→</span>
                      <span className="font-mono text-sky-300">{v.aeroport_arrivee || '—'}</span>
                      <span className="text-slate-500 ml-2 text-xs">
                        {formatTimeUTC(v.depart_utc)}
                        {v.arrivee_utc ? ` – ${formatTimeUTC(v.arrivee_utc)}` : ''}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{formatDuree(v.duree_minutes || 0)}</span>
                    {canDelete && <VolDeleteButton volId={v.id} canDelete={canDelete} />}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>{v.type_avion_militaire || '—'}</span>
                  <span>{libEscadrille(v.escadrille_ou_escadron)}</span>
                  <span>{libNatureVol(v.nature_vol_militaire, v.nature_vol_militaire_autre)}</span>
                  <span>{roleUtilisateurSurVol(v, userId)}</span>
                  {v.callsign && <span className="font-mono">{v.callsign}</span>}
                  {v.mission_reward_final != null && (
                    <span className="text-emerald-400">{v.mission_reward_final.toLocaleString('fr-FR')} F$</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
