import { z } from 'zod';
import { entitySchemas, type AnyEntity, type EntityKind } from '../../domain/models';
import { applyChange, checkTeamLeads } from '../../domain/rules';
import type { Actor, Deps } from '../ports';
import { assertAdmin, toVersionRows } from '../shared';

export const saveEntitiesInput = z.object({
  changes: z
    .array(
      z.object({
        kind: z.enum(Object.keys(entitySchemas) as [EntityKind, ...EntityKind[]]),
        /** The full record. Without an `id` it is created; with one it replaces the current version. */
        data: z.record(z.unknown()),
      }),
    )
    .min(1),
});
export type SaveEntitiesInput = z.infer<typeof saveEntitiesInput>;

/**
 * Creates or replaces records as one unit: all of them are saved or none (spec M2-11 to M2-14).
 * Renaming, moving and deactivating are all "save the record with the new values".
 */
export async function saveEntities(
  input: SaveEntitiesInput,
  actor: Actor,
  deps: Deps,
): Promise<{ entities: AnyEntity[]; dataAsOf: string }> {
  const { changes } = saveEntitiesInput.parse(input);
  const { state: current, currentRowIds } = await deps.repo.load();
  assertAdmin(current, actor);

  let state = current;
  const saved: { kind: EntityKind; entity: AnyEntity }[] = [];
  for (const { kind, data } of changes) {
    const entity = entitySchemas[kind].parse({ ...data, id: data.id ?? deps.newId() }) as AnyEntity;
    if (kind === 'role') {
      // `isSystem` is not editable: it is set by the seed and kept ever after.
      const previous = current.roles.find((r) => r.id === entity.id);
      (entity as { isSystem: boolean }).isSystem = previous?.isSystem ?? false;
    }
    state = applyChange(state, kind, entity as never);
    saved.push({ kind, entity });
  }
  checkTeamLeads(state);

  const rows = toVersionRows(saved, currentRowIds, actor, 'web', deps);
  await deps.repo.append(rows);
  return { entities: saved.map((s) => s.entity), dataAsOf: rows[0]!.recordedAt };
}
