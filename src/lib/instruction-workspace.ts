import type { InstructionProgram } from './instruction-programs';

export type InstructionTab = 'espace' | 'formation' | 'examens' | 'admin';

export function resolveInstructionTab(requested: string | undefined, permissions: { isAdmin: boolean; isManager: boolean; canViewExams: boolean }, sessionKind?: string | null): InstructionTab {
  if (sessionKind && !(requested === 'admin' && permissions.isAdmin)) return sessionKind === 'exam' ? 'examens' : 'espace';
  if (requested === 'admin' && permissions.isAdmin) return 'admin';
  if (requested === 'formation' && permissions.isManager) return 'formation';
  if (requested === 'examens' && permissions.canViewExams) return 'examens';
  return 'espace';
}

export function instructionProgressPercent(program: InstructionProgram | null, completed: ReadonlySet<string>): number {
  if (!program?.modules.length) return 0;
  return Math.round(program.modules.filter(module => completed.has(module.code)).length / program.modules.length * 100);
}
