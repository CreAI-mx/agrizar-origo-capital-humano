import { queryPeople, type PeoplePage, type PeopleQueryInput } from '../../domain/peopleDirectory';
import type { Deps } from '../ports';

export interface PeoplePageView extends PeoplePage {
  dataAsOf: string | null;
}

/**
 * One page of the people directory with the size of each alert tray (spec M2-26).
 * Today it reads the whole organization through the port and pages in memory; the contract is
 * what lets a real store answer it with a query instead (ADR-0001, persistence target).
 */
export async function listPeople(input: PeopleQueryInput | undefined, deps: Deps): Promise<PeoplePageView> {
  const { state, dataAsOf } = await deps.repo.load();
  return { ...queryPeople(state, input ?? {}), dataAsOf };
}
