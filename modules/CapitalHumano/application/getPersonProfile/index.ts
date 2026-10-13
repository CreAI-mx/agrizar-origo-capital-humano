import { DomainError } from '../../domain/errors';
import { personRows, type PersonRow } from '../../domain/peopleDirectory';
import { buildReporting, type PersonRef } from '../../domain/reporting';
import { resolveAccessContext, type AccessContext } from '../../domain/rules';
import type { Deps } from '../ports';

export interface PersonProfile {
  person: PersonRow;
  /** Line of command, from the top of the organization down to the person's boss. */
  chain: PersonRef[];
  /** People who answer to this person. */
  reports: PersonRef[];
  /** What their roles let them see (spec M2-09), read from the same state as the rest. */
  access: AccessContext;
  dataAsOf: string | null;
}

/** Everything the Back Office shows about one person, with their line of command (spec M2-27). */
export async function getPersonProfile(input: { personId: string }, deps: Deps): Promise<PersonProfile> {
  const { state, dataAsOf } = await deps.repo.load();
  const person = personRows(state).find((row) => row.id === input.personId);
  if (!person) throw new DomainError('PERSON_NOT_FOUND', 'No encontramos a esa persona.');
  const reporting = buildReporting(state);
  return { person, chain: reporting.chainOf(person.id), reports: reporting.reportsOf(person.id), access: resolveAccessContext(state, person.id), dataAsOf };
}
