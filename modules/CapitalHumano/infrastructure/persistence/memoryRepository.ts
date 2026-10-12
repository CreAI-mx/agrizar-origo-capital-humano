import type { LoadedOrganization, OrganizationRepository } from '../../application/ports';
import { ConflictError } from '../../domain/errors';
import { COLLECTION, emptyState, type AnyEntity, type EntityKind, type VersionRow } from '../../domain/models';

/**
 * Append-only store held in memory. The current state is derived by replaying the rows:
 * the latest version of each entity wins. Used directly in tests and as the base of the
 * file-backed store.
 */
export class MemoryOrganizationRepository implements OrganizationRepository {
  protected rows: VersionRow[];

  constructor(rows: VersionRow[] = []) {
    this.rows = [...rows];
  }

  async load(): Promise<LoadedOrganization> {
    const latest = new Map<string, VersionRow>();
    let last: VersionRow | null = null;
    let isTestData: boolean | null = null;
    for (const row of this.rows) {
      if (row.kind === 'importRun') {
        const run = row.data as { mode?: string; isTestData?: boolean | null };
        if (run.mode === 'apply') isTestData = isTestData !== false && run.isTestData === true;
        continue;
      }
      latest.set(`${row.kind}:${row.entityId}`, row);
      last = row;
    }
    const state = emptyState();
    const currentRowIds: Record<string, string> = {};
    for (const [key, row] of latest) {
      (state[COLLECTION[row.kind as EntityKind]] as AnyEntity[]).push(row.data as AnyEntity);
      currentRowIds[key] = row.rowId;
    }
    return { state, currentRowIds, dataAsOf: last?.recordedAt ?? null, lastActorId: last?.actorId ?? null, isTestData };
  }

  async append(rows: VersionRow[]): Promise<void> {
    const known = new Set(this.rows.map((row) => row.idempotencyKey));
    const fresh = rows.filter((row) => !known.has(row.idempotencyKey));
    const current = (await this.load()).currentRowIds;
    for (const row of fresh) {
      const key = `${row.kind}:${row.entityId}`;
      if ((current[key] ?? null) !== row.supersedesId) throw new ConflictError();
      current[key] = row.rowId;
    }
    await this.persist(fresh);
    this.rows.push(...fresh);
  }

  async history(entityId: string): Promise<VersionRow[]> {
    return this.rows.filter((row) => row.entityId === entityId);
  }

  /** Hook for durable stores; rows reach memory only after this resolves. */
  protected async persist(_rows: VersionRow[]): Promise<void> {}
}
