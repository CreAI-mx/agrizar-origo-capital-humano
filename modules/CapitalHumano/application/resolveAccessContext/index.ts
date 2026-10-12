import { resolveAccessContext as resolve, type AccessContext } from '../../domain/rules';
import type { Deps } from '../ports';

/** Roles, covered áreas and equipos of one person (spec M2-09). Consumed by AG-1 and MD-5. */
export async function resolveAccessContext(input: { personId: string }, deps: Deps): Promise<AccessContext> {
  const { state } = await deps.repo.load();
  return resolve(state, input.personId);
}
