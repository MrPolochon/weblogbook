/** Reject missing/invalid inputs instead of silently replacing a configured zero. */
export function financialInput(value: string, label: string, maximum: number, integer = false): number {
  if (!value.trim()) throw new Error(`${label} : saisissez une valeur, y compris 0 si nécessaire.`);
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${label} : nombre ${integer ? 'entier ' : ''}compris entre 0 et ${maximum} requis.`);
  }
  return parsed;
}
