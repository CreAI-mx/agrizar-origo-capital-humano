import type { VersionRow } from '../../domain/models';
import type { Deps } from '../ports';

export interface HistoryEntry extends VersionRow {
  actorName: string;
}

/**
 * Every version of one record, newest first, with who made each change (spec M2-15). A
 * person's history includes their role assignments and equipo memberships, and an equipo's
 * includes its memberships: those are separate records, but they are what changed for them.
 */
export async function getHistory(input: { entityId: string }, deps: Deps): Promise<HistoryEntry[]> {
  const { state } = await deps.repo.load();
  const related = [
    ...state.roleAssignments.filter((a) => a.personId === input.entityId),
    ...state.teamMemberships.filter((m) => m.personId === input.entityId || m.teamId === input.entityId),
  ].map((record) => record.id);
  const rows = (await Promise.all([input.entityId, ...related].map((id) => deps.repo.history(id)))).flat();
  return rows
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((row) => ({ ...row, actorName: state.people.find((p) => p.id === row.actorId)?.displayName ?? row.actorId }))
    .reverse();
}
