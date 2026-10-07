import type { ServiceStatut } from '@/lib/types';

const transitions: Record<ServiceStatut, ServiceStatut[]> = {
  pending: ['accepted', 'rejected', 'ground_crew_unavailable'],
  accepted: ['in_progress', 'completed', 'rejected'],
  in_progress: ['completed', 'rejected'],
  completed: [], rejected: [], ground_crew_unavailable: [],
};

export function canTransitionGroundService(from: ServiceStatut, to: ServiceStatut): boolean {
  return transitions[from]?.includes(to) ?? false;
}
