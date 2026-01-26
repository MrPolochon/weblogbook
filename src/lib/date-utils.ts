import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Formate une date en UTC avec le format spécifié
 * Toutes les dates sur le site doivent être affichées en UTC
 */
export function formatDateUTC(date: string | Date, formatStr: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Créer une date en UTC
  const utcDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return format(utcDate, formatStr, { locale: fr });
}

/**
 * Formate une date en UTC avec un format prédéfini
 */
export function formatDateTimeUTC(date: string | Date): string {
  return formatDateUTC(date, 'dd MMMM yyyy à HH:mm') + ' UTC';
}

/**
 * Formate une date courte en UTC (dd/MM)
 */
export function formatDateShortUTC(date: string | Date): string {
  return formatDateUTC(date, 'dd/MM');
}

/**
 * Formate une date moyenne en UTC (dd MMM yyyy)
 */
export function formatDateMediumUTC(date: string | Date): string {
  return formatDateUTC(date, 'dd MMM yyyy');
}

/**
 * Formate l'heure en UTC (HH:mm)
 */
export function formatTimeUTC(date: string | Date): string {
  return formatDateUTC(date, 'HH:mm');
}

/**
 * Formate une date complète avec heure en UTC (dd MMM HH:mm)
 */
export function formatDateHourUTC(date: string | Date): string {
  return formatDateUTC(date, 'dd MMM HH:mm');
}

/**
 * Formate en utilisant toLocaleString avec timezone UTC
 */
export function toLocaleDateStringUTC(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' });
}

/**
 * Formate en utilisant toLocaleTimeString avec timezone UTC
 */
export function toLocaleTimeStringUTC(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('fr-FR', { ...options, timeZone: 'UTC' });
}

/**
 * Formate en utilisant toLocaleString avec timezone UTC
 */
export function toLocaleStringUTC(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('fr-FR', { ...options, timeZone: 'UTC' });
}
