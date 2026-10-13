import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importOrganization } from '../application/importOrganization';
import type { Actor, Deps, OrganizationRepository } from '../application/ports';
import type { OrganizationState } from '../domain/models';
import { MemoryOrganizationRepository } from '../infrastructure/persistence/memoryRepository';

export const SEED_TEXT = readFileSync(resolve(__dirname, '../../../seed/organization.test.json'), 'utf8');
export const SYSTEM: Actor = { personId: 'seed', system: true };

/** Deterministic ids and a clock that moves one second per call. */
export function makeDeps(repo: OrganizationRepository = new MemoryOrganizationRepository()): Deps {
  let ids = 0;
  let tick = 0;
  return {
    repo,
    newId: () => `id-${(ids += 1)}`,
    clock: () => new Date(Date.UTC(2026, 9, 12, 12, 0, (tick += 1))),
  };
}

/** A store loaded with the invented organization of seed/organization.test.json. */
export async function seededDeps(repo?: OrganizationRepository): Promise<Deps> {
  const deps = makeDeps(repo);
  const result = await importOrganization({ mode: 'apply', files: [{ name: 'seed.json', text: SEED_TEXT }], actor: SYSTEM }, deps);
  if (result.summary.error) throw new Error(`Seed has errors: ${JSON.stringify(result.items.filter((i) => i.action === 'error'))}`);
  return deps;
}

/** A load as the Back Office does it: preview first, then confirm that preview (M2-18). */
export async function load(files: { name: string; text: string }[], actor: Actor, deps: Deps) {
  const preview = await importOrganization({ mode: 'preview', files, actor }, deps);
  return importOrganization({ mode: 'apply', files, previewId: preview.importRunId, actor }, deps);
}

export const unit = (state: OrganizationState, code: string) => state.orgUnits.find((u) => u.code === code)!;
export const person = (state: OrganizationState, employeeNumber: string) =>
  state.people.find((p) => p.employeeNumber === employeeNumber)!;
export const role = (state: OrganizationState, code: string) => state.roles.find((r) => r.code === code)!;
