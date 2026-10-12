import type { VersionRow } from '../../domain/models';
import type { Deps } from '../ports';

export interface HistoryEntry extends VersionRow {
  actorName: string;
}

/** Every version of one record, newest first, with who made each change (spec M2-15). */
export async function getHistory(input: { entityId: string }, deps: Deps): Promise<HistoryEntry[]> {
  const [{ state }, rows] = await Promise.all([deps.repo.load(), deps.repo.history(input.entityId)]);
  return rows
    .map((row) => ({ ...row, actorName: state.people.find((p) => p.id === row.actorId)?.displayName ?? row.actorId }))
    .reverse();
}
