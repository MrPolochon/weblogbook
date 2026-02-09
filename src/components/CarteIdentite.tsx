'use client';

import Image from 'next/image';

type CarteData = {
  couleur_fond: string;
  logo_url: string | null;
  photo_url: string | null;
  titre: string;
  sous_titre: string | null;
  nom_affiche: string | null;
  organisation: string | null;
  numero_carte: string | null;
  date_delivrance: string | null;
  date_expiration: string | null;
  cases_haut: string[];
  cases_bas: string[];
};

type Props = {
  carte: CarteData | null;
  identifiant?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export default function CarteIdentite({ carte, identifiant, size = 'md', className = '' }: Props) {
  // Valeurs par défaut si pas de carte
  const data: CarteData = carte || {
    couleur_fond: '#DC2626',
    logo_url: null,
    photo_url: null,
    titre: 'IFSA',
    sous_titre: 'délivré par l\'instance de l\'IFSA',
    nom_affiche: identifiant || '—',
    organisation: 'IFSA',
    numero_carte: '000 00 000000',
    date_delivrance: null,
    date_expiration: null,
    cases_haut: [],
    cases_bas: [],
  };

  // Tailles selon le prop size
  const sizes = {
    sm: { width: 180, height: 260, fontSize: 'text-[8px]', titleSize: 'text-sm', padding: 'p-2' },
    md: { width: 280, height: 400, fontSize: 'text-xs', titleSize: 'text-xl', padding: 'p-3' },
    lg: { width: 350, height: 500, fontSize: 'text-sm', titleSize: 'text-2xl', padding: 'p-4' },
  };
  const s = sizes[size];

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR');
    } catch {
      return dateStr;
    }
  }

  return (
    <div
      className={`rounded-lg shadow-lg overflow-hidden ${className}`}
      style={{ 
        backgroundColor: data.couleur_fond, 
        width: s.width, 
        minHeight: s.height,
      }}
    >
      <div className={`${s.padding} flex flex-col h-full`}>
        {/* Titre principal */}
        <div className="bg-white rounded-md px-3 py-2 mb-2">
          <h2 className={`${s.titleSize} font-bold text-center text-slate-900`}>{data.titre}</h2>
        </div>

        {/* Cases du haut (qualifications) */}
        {data.cases_haut.length > 0 && (
          <div className="flex gap-1 mb-2">
            {data.cases_haut.map((c, i) => (
              <div key={i} className="flex-1 bg-white rounded px-1 py-1 text-center">
                <span className={`${s.fontSize} font-bold text-slate-900`}>{c}</span>
              </div>
            ))}
            {/* Case vide pour compléter si moins de 5 */}
            {data.cases_haut.length < 5 && (
              <div className="flex-1 bg-white rounded px-1 py-1" />
            )}
          </div>
        )}

        {/* Sous-titre */}
        {data.sous_titre && (
          <p className={`${s.fontSize} text-white text-center mb-2 italic`}>
            {data.sous_titre}
          </p>
        )}

        {/* Logo et photo */}
        <div className="flex items-start gap-2 mb-3">
          {/* Logo */}
          <div className="flex-1 flex items-center justify-center">
            {data.logo_url ? (
              <Image
                src={data.logo_url}
                alt="Logo"
                width={size === 'sm' ? 50 : size === 'md' ? 80 : 100}
                height={size === 'sm' ? 50 : size === 'md' ? 80 : 100}
                className="object-contain"
              />
            ) : (
              <div className="flex flex-col items-center">
                <div 
                  className="rounded-full border-2 border-white/50 flex items-center justify-center"
                  style={{ 
                    width: size === 'sm' ? 50 : size === 'md' ? 80 : 100,
                    height: size === 'sm' ? 50 : size === 'md' ? 80 : 100,
                  }}
                >
                  <span className={`${s.fontSize} text-white/70 font-bold`}>LOGO</span>
                </div>
                <span className={`${s.fontSize} text-white mt-1 font-semibold`}>{data.organisation}</span>
              </div>
            )}
          </div>

          {/* Photo */}
          <div className="flex-1 flex justify-center">
            {data.photo_url ? (
              <Image
                src={data.photo_url}
                alt="Photo"
                width={size === 'sm' ? 60 : size === 'md' ? 90 : 110}
                height={size === 'sm' ? 70 : size === 'md' ? 105 : 130}
                className="rounded object-cover bg-white"
              />
            ) : (
              <div 
                className="rounded bg-slate-300 flex items-center justify-center"
                style={{ 
                  width: size === 'sm' ? 60 : size === 'md' ? 90 : 110,
                  height: size === 'sm' ? 70 : size === 'md' ? 105 : 130,
                }}
              >
                <span className={`${s.fontSize} text-slate-500`}>Photo</span>
              </div>
            )}
          </div>
        </div>

        {/* Informations */}
        <div className="space-y-1 text-white">
          {/* Date */}
          <p className={`${size === 'sm' ? 'text-sm' : size === 'md' ? 'text-lg' : 'text-xl'} font-bold`}>
            {formatDate(data.date_expiration || data.date_delivrance)}
          </p>

          {/* Nom */}
          <p className={`${size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : 'text-lg'} font-bold uppercase`}>
            {data.nom_affiche || identifiant || '—'}
          </p>

          {/* Organisation */}
          <p className={`${s.fontSize} font-semibold`}>
            {data.organisation}
          </p>

          {/* Numéro */}
          <p className={`${s.fontSize} font-mono`}>
            {data.numero_carte || '000 00 000000'}
          </p>
        </div>

        {/* Cases du bas (catégories) */}
        {data.cases_bas.length > 0 && (
          <div className="flex gap-1 mt-auto pt-3">
            {data.cases_bas.map((c, i) => (
              <div key={i} className="flex-1 bg-white rounded px-2 py-2 text-center">
                <span className={`${size === 'sm' ? 'text-lg' : size === 'md' ? 'text-2xl' : 'text-3xl'} font-bold text-slate-900`}>
                  {c}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
