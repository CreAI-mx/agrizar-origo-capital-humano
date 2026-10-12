import type { OrganizationState } from '../../domain/models';
import type { Deps } from '../ports';

export interface OrganizationView extends OrganizationState {
  dataAsOf: string | null;
  lastChangedBy: string | null;
  /** True when every load applied so far declared its content invented; null before any load. */
  isTestData: boolean | null;
}

/** Current state of the organization, with when it last changed and who changed it (spec M2-15). */
export async function getOrganization(_input: void, deps: Deps): Promise<OrganizationView> {
  const { state, dataAsOf, lastActorId, isTestData } = await deps.repo.load();
  const lastChangedBy = state.people.find((p) => p.id === lastActorId)?.displayName ?? lastActorId;
  return { ...state, dataAsOf, lastChangedBy, isTestData };
}
