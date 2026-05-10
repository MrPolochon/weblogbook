/**
 * Avatar utilisateur partage par l'ensemble du site. Source unique de verite
 * pour la "photo de profil" : c'est exactement la meme image que celle qui
 * apparait sur la carte d'identification (champ `cartes_identite.photo_url`).
 *
 * Si aucune photo n'est disponible, on retombe sur un cercle colore avec la
 * premiere lettre de l'identifiant (couleur deterministe par hash).
 *
 * NB : composant pur (sans hook) pour pouvoir etre utilise indistinctement
 * dans des composants serveur ou client. Volontairement en `<img>` natif
 * pour eviter la configuration `next.config.js > images.remotePatterns` sur
 * les domaines Supabase Storage variables d'un projet a l'autre.
 */

const FALLBACK_COLORS = [
  'bg-violet-500/25 text-violet-200 ring-violet-500/40',
  'bg-emerald-500/25 text-emerald-200 ring-emerald-500/40',
  'bg-sky-500/25 text-sky-200 ring-sky-500/40',
  'bg-amber-500/25 text-amber-200 ring-amber-500/40',
  'bg-rose-500/25 text-rose-200 ring-rose-500/40',
  'bg-teal-500/25 text-teal-200 ring-teal-500/40',
  'bg-fuchsia-500/25 text-fuchsia-200 ring-fuchsia-500/40',
];

function pickFallbackColor(name: string): string {
  if (!name) return FALLBACK_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % FALLBACK_COLORS.length;
  return FALLBACK_COLORS[h];
}

const SIZE_PX: Record<NonNullable<UserAvatarProps['size']>, number> = {
  xs: 24,
  sm: 28,
  md: 32,
  lg: 40,
  xl: 56,
};

const SIZE_TEXT: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'text-[10px]',
  sm: 'text-[11px]',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-base',
};

export type UserAvatarProps = {
  /** Identifiant joueur — utilise pour le fallback (initiale + couleur stable). */
  identifiant: string | null | undefined;
  /** URL absolue de la photo (cartes_identite.photo_url). Optionnelle. */
  photoUrl?: string | null;
  /** Tailles preset alignees sur les usages du site. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Classes additionnelles (ex. ring de selection). */
  className?: string;
  /** Force le label `alt` ; sinon utilise l'identifiant. */
  alt?: string;
};

export default function UserAvatar({
  identifiant,
  photoUrl,
  size = 'md',
  className = '',
  alt,
}: UserAvatarProps) {
  const px = SIZE_PX[size];
  const ident = (identifiant || '').trim();
  const letter = (ident[0] || '?').toUpperCase();
  const fallbackClass = pickFallbackColor(ident || letter);

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={alt ?? ident ?? 'Avatar'}
        width={px}
        height={px}
        loading="lazy"
        className={`rounded-full object-cover bg-slate-800 ring-1 ring-slate-700/40 shrink-0 ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ring-1 ${fallbackClass} ${SIZE_TEXT[size]} ${className}`}
      style={{ width: px, height: px }}
      aria-label={alt ?? ident ?? 'Avatar'}
    >
      {letter}
    </div>
  );
}
