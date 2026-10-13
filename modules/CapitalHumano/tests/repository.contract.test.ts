import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OrganizationRepository } from '../application/ports';
import { ConflictError } from '../domain/errors';
import type { VersionRow } from '../domain/models';
import { FileOrganizationRepository } from '../infrastructure/persistence/fileRepository';
import { MemoryOrganizationRepository } from '../infrastructure/persistence/memoryRepository';

const row = (rowId: string, name: string, supersedesId: string | null): VersionRow => ({
  rowId,
  kind: 'role',
  entityId: 'role-1',
  data: { id: 'role-1', code: 'supervisor', name, description: '', level: null, isSystem: false, status: 'active' },
  recordedAt: `2026-10-12T12:00:0${rowId.slice(-1)}.000Z`,
  effectiveAt: '2026-10-12T12:00:00.000Z',
  actorId: 'tester',
  source: 'web',
  sourceRef: null,
  supersedesId,
  idempotencyKey: `key-${rowId}`,
});

// Every store must pass the same suite (docs/spec/functional-spec.md §1.6).
const stores: [string, () => Promise<{ repo: OrganizationRepository; reopen?: () => Promise<OrganizationRepository> }>][] = [
  ['memory', async () => ({ repo: new MemoryOrganizationRepository() })],
  [
    'file',
    async () => {
      const path = join(mkdtempSync(join(tmpdir(), 'origo-')), 'events.jsonl');
      return { repo: await FileOrganizationRepository.open(path), reopen: () => FileOrganizationRepository.open(path) };
    },
  ],
];

describe.each(stores)('OrganizationRepository contract: %s', (_name, open) => {
  it('lets only one of two simultaneous writes over the same version through', async () => {
    const { repo } = await open();
    await repo.append([row('r1', 'Supervisor', null)]);
    const results = await Promise.allSettled([repo.append([row('r2', 'Supervisor A', 'r1')]), repo.append([row('r3', 'Supervisor B', 'r1')])]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect((await repo.history('role-1')).map((r) => r.rowId)).toEqual(['r1', 'r2']);
  });

  it('starts empty', async () => {
    const { repo } = await open();
    expect((await repo.load()).dataAsOf).toBeNull();
  });

  it('keeps every version and serves the latest as current (R-10)', async () => {
    const { repo } = await open();
    await repo.append([row('r1', 'Supervisor', null)]);
    await repo.append([row('r2', 'Supervisor de campo', 'r1')]);
    const loaded = await repo.load();
    expect(loaded.state.roles).toEqual([expect.objectContaining({ name: 'Supervisor de campo' })]);
    expect(loaded.currentRowIds['role:role-1']).toBe('r2');
    expect(loaded.dataAsOf).toBe('2026-10-12T12:00:02.000Z');
    expect((await repo.history('role-1')).map((r) => r.rowId)).toEqual(['r1', 'r2']);
  });

  it('rejects a write that supersedes a row that is no longer current', async () => {
    const { repo } = await open();
    await repo.append([row('r1', 'Supervisor', null)]);
    await repo.append([row('r2', 'B', 'r1')]);
    await expect(repo.append([row('r3', 'C', 'r1')])).rejects.toBeInstanceOf(ConflictError);
    expect((await repo.history('role-1')).length).toBe(2);
  });

  it('ignores a row it has already stored (idempotency key)', async () => {
    const { repo } = await open();
    await repo.append([row('r1', 'Supervisor', null)]);
    await repo.append([row('r1', 'Supervisor', null)]);
    expect((await repo.history('role-1')).length).toBe(1);
  });

  it('survives a restart when the store is durable', async () => {
    const { repo, reopen } = await open();
    await repo.append([row('r1', 'Supervisor', null)]);
    if (!reopen) return;
    expect((await (await reopen()).load()).state.roles).toHaveLength(1);
  });
});
