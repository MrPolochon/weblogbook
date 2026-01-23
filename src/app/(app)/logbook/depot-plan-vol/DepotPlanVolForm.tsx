'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

type Avion = { id: string; typeAvionId: string; nom: string };
type TypeAvion = { id: string; nom: string };
type Compagnie = { id: string; nom: string };

type Props = {
  compagnies: Compagnie[];
  compagnieParDefaut: string | null;
  avionsCompagnieParDefaut: Avion[];
  inventairePersonnel: Avion[];
  typesAvion: TypeAvion[];
};

export default function DepotPlanVolForm({ compagnies, compagnieParDefaut, avionsCompagnieParDefaut, inventairePersonnel, typesAvion }: Props) {
  const router = useRouter();
  const [aeroport_depart, setAeroportDepart] = useState('');
  const [aeroport_arrivee, setAeroportArrivee] = useState('');
  const [numero_vol, setNumeroVol] = useState('');
  const [porte, setPorte] = useState('');
  const [temps_prev_min, setTempsPrevMin] = useState('');
  const [type_vol, setTypeVol] = useState<'VFR' | 'IFR'>('VFR');
  const [intentions_vol, setIntentionsVol] = useState('');
  const [sid_depart, setSidDepart] = useState('');
  const [star_arrivee, setStarArrivee] = useState('');
  const [route_ifr, setRouteIfr] = useState('');
  const [note_atc, setNoteAtc] = useState('');
  const [vol_commercial, setVolCommercial] = useState(false);
  const [nature_cargo, setNatureCargo] = useState('');
  const [compagnie_selectionnee, setCompagnieSelectionnee] = useState<string>(compagnieParDefaut || '');
  const [avionsCompagnie, setAvionsCompagnie] = useState<Avion[]>(avionsCompagnieParDefaut);
  const [loadingAvions, setLoadingAvions] = useState(false);
  const [source_avion, setSourceAvion] = useState<'compagnie' | 'personnel' | 'autre'>('autre');
  const [avion_compagnie_id, setAvionCompagnieId] = useState('');
  const [avion_inventaire_id, setAvionInventaireId] = useState('');
  const [type_avion_id, setTypeAvionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger les avions de la compagnie sélectionnée
  async function chargerAvionsCompagnie(compagnieId: string) {
    if (!compagnieId) {
      setAvionsCompagnie([]);
      return;
    }
    setLoadingAvions(true);
    try {
      const supabase = createClient();
      // Récupérer tous les avions de la compagnie
      const { data: avions } = await supabase
        .from('compagnies_avions')
        .select('id, type_avion_id, quantite, nom_avion, types_avion(nom, constructeur)')
        .eq('compagnie_id', compagnieId);

      if (!avions || avions.length === 0) {
        setAvionsCompagnie([]);
        return;
      }

      // Récupérer les avions utilisés
      const avionIds = avions.map((a) => a.id);
      const { data: avionsUtilises } = await supabase
        .from('avions_utilisation')
        .select('compagnie_avion_id')
        .in('compagnie_avion_id', avionIds);

      const avionsUtilisesIds = (avionsUtilises || []).map((u: any) => u.compagnie_avion_id);
      const avionsDisponibles = avions.filter((a: any) => !avionsUtilisesIds.includes(a.id));

      setAvionsCompagnie(
        avionsDisponibles.map((a: any) => ({
          id: a.id,
          typeAvionId: a.type_avion_id,
          nom: a.nom_avion || `${(a.types_avion as any)?.constructeur || ''} ${(a.types_avion as any)?.nom || ''}`.trim(),
        }))
      );
    } catch (err) {
      console.error('Erreur chargement avions:', err);
      setAvionsCompagnie([]);
    } finally {
      setLoadingAvions(false);
    }
  }

  // Charger les avions au montage si une compagnie par défaut existe
  useEffect(() => {
    if (compagnieParDefaut && vol_commercial && compagnie_selectionnee === compagnieParDefaut) {
      chargerAvionsCompagnie(compagnieParDefaut);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quand la compagnie change, charger ses avions
  const handleCompagnieChange = (compagnieId: string) => {
    setCompagnieSelectionnee(compagnieId);
    setAvionCompagnieId('');
    chargerAvionsCompagnie(compagnieId);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const t = parseInt(temps_prev_min, 10);
    if (!aeroport_depart || !aeroport_arrivee || !numero_vol.trim() || isNaN(t) || t < 1 || !type_vol) {
      setError('Remplissez tous les champs requis.');
      return;
    }
    if (type_vol === 'VFR' && !intentions_vol.trim()) { setError('Intentions de vol requises pour VFR.'); return; }
    if (type_vol === 'IFR' && (!sid_depart.trim() || !star_arrivee.trim())) { setError('SID de départ et STAR d\'arrivée requises pour IFR.'); return; }

    let avionId: string | null = null;
    if (source_avion === 'compagnie') {
      if (!avion_compagnie_id) {
        setError('Sélectionnez un avion de la compagnie.');
        return;
      }
      avionId = avion_compagnie_id;
    } else if (source_avion === 'personnel') {
      if (!avion_inventaire_id) {
        setError('Sélectionnez un avion de votre inventaire.');
        return;
      }
      avionId = avion_inventaire_id;
    } else {
      if (!type_avion_id) {
        setError('Sélectionnez un type d\'avion.');
        return;
      }
    }

    if (vol_commercial && !compagnie_selectionnee) {
      setError('Sélectionnez une compagnie pour effectuer un vol commercial.');
      return;
    }

    setLoading(true);
    try {
      const body: any = {
        aeroport_depart,
        aeroport_arrivee,
        numero_vol: numero_vol.trim(),
        porte: porte.trim() || undefined,
        temps_prev_min: t,
        type_vol,
        intentions_vol: type_vol === 'VFR' ? intentions_vol.trim() : undefined,
        sid_depart: type_vol === 'IFR' ? sid_depart.trim() : undefined,
        star_arrivee: type_vol === 'IFR' ? star_arrivee.trim() : undefined,
        route_ifr: type_vol === 'IFR' && route_ifr.trim() ? route_ifr.trim() : undefined,
        note_atc: note_atc.trim() ? note_atc.trim() : undefined,
        vol_commercial,
        compagnie_id: vol_commercial ? compagnie_selectionnee : undefined,
        nature_cargo: vol_commercial && nature_cargo.trim() ? nature_cargo.trim() : undefined,
      };

      if (source_avion === 'compagnie') {
        body.compagnie_avion_id = avion_compagnie_id;
      } else if (source_avion === 'personnel') {
        body.inventaire_avion_id = avion_inventaire_id;
      } else {
        body.type_avion_id = type_avion_id;
      }

      const res = await fetch('/api/plans-vol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push('/logbook/plans-vol');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Aéroport de départ *</label>
          <select className="input" value={aeroport_depart} onChange={(e) => setAeroportDepart(e.target.value)} required>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Aéroport d&apos;arrivée *</label>
          <select className="input" value={aeroport_arrivee} onChange={(e) => setAeroportArrivee(e.target.value)} required>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Numéro de vol *</label>
          <input type="text" className="input" value={numero_vol} onChange={(e) => setNumeroVol(e.target.value)} required />
        </div>
        <div>
          <label className="label">Porte</label>
          <input type="text" className="input" value={porte} onChange={(e) => setPorte(e.target.value)} placeholder="Optionnel" />
        </div>
      </div>
      <div>
        <label className="label">Temps de vol prévu (minutes) *</label>
        <input type="number" className="input w-32" value={temps_prev_min} onChange={(e) => setTempsPrevMin(e.target.value)} min={1} required />
      </div>
      <div>
        <span className="label block">Type de vol *</span>
        <div className="flex gap-4 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="type" checked={type_vol === 'VFR'} onChange={() => setTypeVol('VFR')} />
            <span className="text-slate-300">VFR</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="type" checked={type_vol === 'IFR'} onChange={() => setTypeVol('IFR')} />
            <span className="text-slate-300">IFR</span>
          </label>
        </div>
      </div>
      {type_vol === 'VFR' && (
        <div>
          <label className="label">Intentions de vol *</label>
          <textarea className="input min-h-[80px]" value={intentions_vol} onChange={(e) => setIntentionsVol(e.target.value)} required />
        </div>
      )}
      {type_vol === 'IFR' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">SID de départ *</label>
              <input type="text" className="input" value={sid_depart} onChange={(e) => setSidDepart(e.target.value)} required />
            </div>
            <div>
              <label className="label">STAR d&apos;arrivée *</label>
              <input type="text" className="input" value={star_arrivee} onChange={(e) => setStarArrivee(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="label">Route IFR (optionnel)</label>
            <textarea
              className="input min-h-[60px]"
              value={route_ifr}
              onChange={(e) => setRouteIfr(e.target.value)}
              placeholder="Ex: DCT LFPG DCT..."
            />
          </div>
        </>
      )}
      <div>
        <label className="label">Note à l&apos;attention de l&apos;ATC (optionnel)</label>
        <textarea
          className="input min-h-[60px]"
          value={note_atc}
          onChange={(e) => setNoteAtc(e.target.value)}
          placeholder="Informations supplémentaires pour l&apos;ATC"
        />
      </div>
      {compagnies.length > 0 && (
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={vol_commercial}
              onChange={(e) => {
                setVolCommercial(e.target.checked);
                if (e.target.checked && compagnieParDefaut && !compagnie_selectionnee) {
                  setCompagnieSelectionnee(compagnieParDefaut);
                  chargerAvionsCompagnie(compagnieParDefaut);
                }
              }}
              className="rounded"
            />
            <span className="text-slate-300">Je vole pour ma compagnie</span>
          </label>
          {vol_commercial && (
            <div className="mt-2 ml-6 space-y-2">
              {compagnies.length > 1 ? (
                <div>
                  <label className="label">Compagnie *</label>
                  <select
                    className="input"
                    value={compagnie_selectionnee}
                    onChange={(e) => handleCompagnieChange(e.target.value)}
                    required
                  >
                    <option value="">— Choisir —</option>
                    {compagnies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-slate-400 text-sm">{compagnies[0]?.nom}</p>
              )}
              {loadingAvions && <p className="text-slate-400 text-sm">Chargement des avions...</p>}
              <div>
                <label className="label">Nature du transport (optionnel)</label>
                <input
                  type="text"
                  className="input"
                  value={nature_cargo}
                  onChange={(e) => setNatureCargo(e.target.value)}
                  placeholder="Ex: Cargo, Passagers, Mixte"
                />
              </div>
            </div>
          )}
        </div>
      )}
      <div>
        <label className="label">Avion *</label>
        <div className="space-y-2">
          <div className="flex gap-4">
            {vol_commercial && compagnie_selectionnee && avionsCompagnie.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="source_avion"
                  checked={source_avion === 'compagnie'}
                  onChange={() => {
                    setSourceAvion('compagnie');
                    setAvionInventaireId('');
                    setTypeAvionId('');
                  }}
                />
                <span className="text-slate-300">Avion compagnie</span>
              </label>
            )}
            {inventairePersonnel.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="source_avion"
                  checked={source_avion === 'personnel'}
                  onChange={() => {
                    setSourceAvion('personnel');
                    setAvionCompagnieId('');
                    setTypeAvionId('');
                  }}
                />
                <span className="text-slate-300">Mon inventaire</span>
              </label>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="source_avion"
                checked={source_avion === 'autre'}
                onChange={() => {
                  setSourceAvion('autre');
                  setAvionCompagnieId('');
                  setAvionInventaireId('');
                }}
              />
              <span className="text-slate-300">Autre</span>
            </label>
          </div>
          {source_avion === 'compagnie' && (
            <select
              className="input"
              value={avion_compagnie_id}
              onChange={(e) => setAvionCompagnieId(e.target.value)}
              required
            >
              <option value="">— Choisir —</option>
              {avionsCompagnie.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom}
                </option>
              ))}
            </select>
          )}
          {source_avion === 'personnel' && (
            <select
              className="input"
              value={avion_inventaire_id}
              onChange={(e) => setAvionInventaireId(e.target.value)}
              required
            >
              <option value="">— Choisir —</option>
              {inventairePersonnel.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom}
                </option>
              ))}
            </select>
          )}
          {source_avion === 'autre' && (
            <select
              className="input"
              value={type_avion_id}
              onChange={(e) => setTypeAvionId(e.target.value)}
              required
            >
              <option value="">— Choisir —</option>
              {typesAvion.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nom}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Envoi…' : 'Déposer le plan de vol'}</button>
    </form>
  );
}
