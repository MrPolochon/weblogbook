import type { ArmeeGradeId } from './types';

export type { ArmeeGradeId };

export type ArmeeGrade = {
  id: ArmeeGradeId;
  label: string;
  minMissions: number;
  /** Couleur Tailwind pour badges UI */
  color: string;
  bg: string;
};

export const ARMEE_GRADES: ArmeeGrade[] = [
  { id: 'recrue', label: 'Recrue', minMissions: 0, color: 'text-slate-400', bg: 'bg-slate-500/15 border-slate-500/25' },
  { id: 'soldat', label: 'Soldat de l\'air', minMissions: 3, color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/25' },
  { id: 'caporal', label: 'Caporal-chef', minMissions: 8, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/25' },
  { id: 'sergent', label: 'Sergent', minMissions: 15, color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/25' },
  { id: 'adjudant', label: 'Adjudant', minMissions: 25, color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/25' },
  { id: 'lieutenant', label: 'Lieutenant', minMissions: 40, color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/25' },
  { id: 'capitaine', label: 'Capitaine', minMissions: 60, color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/25' },
  { id: 'commandant', label: 'Commandant', minMissions: 90, color: 'text-rose-400', bg: 'bg-rose-500/15 border-rose-500/25' },
  { id: 'colonel', label: 'Colonel', minMissions: 130, color: 'text-yellow-300', bg: 'bg-yellow-500/15 border-yellow-500/25' },
];

export function getGradeForMissionCount(missionsCompleted: number): ArmeeGrade {
  let current = ARMEE_GRADES[0];
  for (const g of ARMEE_GRADES) {
    if (missionsCompleted >= g.minMissions) current = g;
    else break;
  }
  return current;
}

export function getNextGrade(current: ArmeeGrade): ArmeeGrade | null {
  const idx = ARMEE_GRADES.findIndex((g) => g.id === current.id);
  if (idx < 0 || idx >= ARMEE_GRADES.length - 1) return null;
  return ARMEE_GRADES[idx + 1];
}

export function gradeMeetsMinimum(userGrade: ArmeeGrade, requiredGradeId: ArmeeGradeId): boolean {
  const required = ARMEE_GRADES.find((g) => g.id === requiredGradeId);
  if (!required) return true;
  return userGrade.minMissions >= required.minMissions;
}

export function getGradeById(id: ArmeeGradeId): ArmeeGrade {
  return ARMEE_GRADES.find((g) => g.id === id) || ARMEE_GRADES[0];
}
