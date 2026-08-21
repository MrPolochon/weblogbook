import { ticketChannelName, type SupportStatus } from '@/lib/support/motifs';

/**
 * Discord n'accepte que 100 caractères et rabat les majuscules/espaces sur des
 * tirets. Le serveur a beaucoup de pseudos exotiques (« GE | 丂乇ㄥㄚ卂几乇 ») :
 * on décompose en NFKD pour récupérer ce qui est translittérable, puis on ne
 * garde que [a-z0-9-]. Si rien de lisible ne survit, on renvoie une chaîne vide
 * et l'appelant garde le nom de base plutôt que de produire un salon « --- ».
 */
export function slugifyChannelLabel(raw: string): string {
  return String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/**
 * Nom de salon d'un ticket, convention existante préservée :
 * `<emoji d'état>-<identifiant court>` auquel on ajoute un libellé optionnel.
 */
export function ticketChannelNameWithLabel(
  status: SupportStatus,
  shortId: string,
  label?: string | null
): string {
  const base = ticketChannelName(status, shortId);
  const slug = slugifyChannelLabel(label || '');
  if (!slug) return base;
  return `${base}-${slug}`.slice(0, 100).replace(/-+$/g, '');
}
