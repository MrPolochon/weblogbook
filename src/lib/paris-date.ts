const PARIS_TIMEZONE = 'Europe/Paris';

export function getParisCalendarYear(date: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: PARIS_TIMEZONE,
      year: 'numeric',
    }).format(date),
    10,
  );
}
