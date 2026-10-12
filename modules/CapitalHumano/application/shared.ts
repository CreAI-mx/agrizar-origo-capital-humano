import { ForbiddenError } from '../domain/errors';
import type { EntityKind, OrganizationState, VersionRow } from '../domain/models';
import { resolveAccessContext } from '../domain/rules';
import type { Actor, Deps } from './ports';

/** R-12: only an Administrador de Origo may write. */
export function assertAdmin(state: OrganizationState, actor: Actor): void {
  if (actor.system) return;
  if (!resolveAccessContext(state, actor.personId).isAdmin) throw new ForbiddenError();
}

// FNV-1a: a short, stable key for "this exact content of this entity".
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Builds version rows for a batch, chaining `supersedesId` when one entity changes twice. */
export function toVersionRows(
  changes: { kind: EntityKind | 'importRun'; entity: { id: string }; sourceRef?: string | null }[],
  currentRowIds: Record<string, string>,
  actor: Actor,
  source: string,
  deps: Deps,
): VersionRow[] {
  const now = deps.clock().toISOString();
  const latest = { ...currentRowIds };
  return changes.map(({ kind, entity, sourceRef }) => {
    const key = `${kind}:${entity.id}`;
    const row: VersionRow = {
      rowId: deps.newId(),
      kind,
      entityId: entity.id,
      data: entity,
      recordedAt: now,
      effectiveAt: now,
      actorId: actor.personId,
      source,
      sourceRef: sourceRef ?? null,
      supersedesId: latest[key] ?? null,
      idempotencyKey: `${key}:${latest[key] ?? 'new'}:${contentHash(JSON.stringify(entity))}`,
    };
    latest[key] = row.rowId;
    return row;
  });
}
