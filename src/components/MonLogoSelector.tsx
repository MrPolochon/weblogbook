'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Building2, Check, Loader2, Sparkles, XCircle, Crown, Shield, User } from 'lucide-react';
import { toast } from 'sonner';

type Compagnie = {
  id: string;
  nom: string;
  logo_url: string | null;
  role_user: 'pdg' | 'co_pdg' | 'employe';
};

type Current = {
  logo_source: 'auto' | 'compagnie' | 'manuel' | 'aucun';
  logo_compagnie_id: string | null;
  logo_url: string | null;
};

type Props = {
  onChange?: (newLogoUrl: string | null) => void;
};

const ROLE_META: Record<Compagnie['role_user'], { label: string; Icon: typeof Crown; classes: string }> = {
  pdg: { label: 'PDG', Icon: Crown, classes: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  co_pdg: { label: 'Co-PDG', Icon: Shield, classes: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
  employe: { label: 'Employé', Icon: User, classes: 'bg-slate-600/30 text-slate-300 border-slate-500/40' },
};

export default function MonLogoSelector({ onChange }: Props) {
  const [compagnies, setCompagnies] = useState<Compagnie[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // identifiant de l'option en cours de sauvegarde

  async function load() {
    try {
      const res = await fetch('/api/cartes/mes-logos-disponibles');
      if (!res.ok) {
        toast.error('Impossible de charger vos compagnies');
        return;
      }
      const data = await res.json();
      setCompagnies(data.compagnies ?? []);
      setCurrent(data.current);
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function setChoice(payload: { logo_source: 'auto' | 'compagnie' | 'aucun'; logo_compagnie_id?: string | null }, key: string) {
    setSaving(key);
    try {
      const res = await fetch('/api/cartes/mon-logo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'Erreur lors de la mise à jour');
        return;
      }
      setCurrent({
        logo_source: data.logo_source,
        logo_compagnie_id: data.logo_compagnie_id,
        logo_url: data.logo_url,
      });
      onChange?.(data.logo_url ?? null);
      toast.success('Logo de carte mis à jour');
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
        <span className="text-sm text-slate-400">Chargement de vos compagnies...</span>
      </div>
    );
  }

  if (current?.logo_source === 'manuel') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
        <div className="flex items-start gap-2">
          <Building2 className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-100/90">
            <p className="font-medium text-amber-200">Logo défini manuellement par un administrateur</p>
            <p className="text-xs text-amber-200/70 mt-1">
              Pour changer, demande à un admin/IFSA de modifier ta carte, ou bascule en mode automatique ci-dessous.
            </p>
          </div>
        </div>
        <button
          onClick={() => setChoice({ logo_source: 'auto' }, 'auto')}
          disabled={saving !== null}
          className="text-xs px-3 py-1.5 rounded-md bg-slate-700/60 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-50"
        >
          {saving === 'auto' ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
          Repasser en logo automatique
        </button>
      </div>
    );
  }

  const isAuto = current?.logo_source === 'auto';
  const isAucun = current?.logo_source === 'aucun';
  const choisiId = current?.logo_compagnie_id ?? null;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-sky-400" />
          Logo de ma carte
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {compagnies.length === 0
            ? "Tu n'es rattaché à aucune compagnie."
            : `Tu es rattaché à ${compagnies.length} compagnie${compagnies.length > 1 ? 's' : ''}. Choisis le logo affiché sur ta carte.`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Option Auto */}
        <Choice
          active={isAuto}
          loading={saving === 'auto'}
          onClick={() => setChoice({ logo_source: 'auto' }, 'auto')}
          icon={<Sparkles className="h-4 w-4 text-emerald-400" />}
          title="Automatique"
          subtitle="Logo de ta première compagnie"
        />

        {/* Compagnies */}
        {compagnies.map((c) => {
          const meta = ROLE_META[c.role_user];
          const active = current?.logo_source === 'compagnie' && choisiId === c.id;
          return (
            <Choice
              key={c.id}
              active={active}
              loading={saving === c.id}
              onClick={() => setChoice({ logo_source: 'compagnie', logo_compagnie_id: c.id }, c.id)}
              icon={
                c.logo_url ? (
                  <Image
                    src={c.logo_url}
                    alt=""
                    width={28}
                    height={28}
                    className="rounded-md object-contain bg-white/5 p-0.5"
                    unoptimized
                  />
                ) : (
                  <div className="h-7 w-7 rounded-md bg-slate-700/50 flex items-center justify-center">
                    <Building2 className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                )
              }
              title={c.nom}
              subtitle={
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${meta.classes}`}>
                  <meta.Icon className="h-2.5 w-2.5" />
                  {meta.label}
                  {!c.logo_url && <span className="ml-1 text-slate-500">(pas de logo)</span>}
                </span>
              }
              disabled={!c.logo_url}
            />
          );
        })}

        {/* Option Aucun */}
        <Choice
          active={isAucun}
          loading={saving === 'aucun'}
          onClick={() => setChoice({ logo_source: 'aucun' }, 'aucun')}
          icon={<XCircle className="h-4 w-4 text-rose-400" />}
          title="Aucun logo"
          subtitle="Carte sans logo"
        />
      </div>
    </div>
  );
}

type ChoiceProps = {
  active: boolean;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
};

function Choice({ active, loading, disabled, onClick, icon, title, subtitle }: ChoiceProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`relative flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200 ${
        active
          ? 'border-sky-400/60 bg-sky-500/10 shadow-[0_0_20px_rgba(56,189,248,0.15)]'
          : 'border-slate-700/50 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-800/50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-100 truncate">{title}</p>
        <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>
      </div>
      {active && !loading && (
        <div className="flex-shrink-0 h-5 w-5 rounded-full bg-sky-500/20 border border-sky-400/60 flex items-center justify-center">
          <Check className="h-3 w-3 text-sky-300" />
        </div>
      )}
      {loading && (
        <Loader2 className="h-4 w-4 text-sky-400 animate-spin flex-shrink-0" />
      )}
    </button>
  );
}
