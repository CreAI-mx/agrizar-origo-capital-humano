import { describe, expect, it } from 'vitest';
import { importOrganization } from '../application/importOrganization';
import { parseCsv } from '../application/importOrganization/parseFiles';
import { ForbiddenError } from '../domain/errors';
import { SEED_TEXT, person, seededDeps, unit } from './helpers';

const AREAS_CSV = [
  'Código,Nombre,Tipo,Área superior',
  'CH-CAP,"Capacitación, Desarrollo",area,DIR-CH',
  'CH-REC,Reclutamiento y Selección,area,DIR-CH',
  'CH-XXX,Área huérfana,area,NO-EXISTE',
].join('\r\n');
const files = [{ name: 'areas.csv', text: AREAS_CSV }];

describe('bulk load (GRZR-31 AC2)', () => {
  it('reads CSV with accents in headers, quotes and CRLF', () => {
    const rows = parseCsv(AREAS_CSV);
    expect(rows[0]).toEqual({ codigo: 'CH-CAP', nombre: 'Capacitación, Desarrollo', tipo: 'area', area_superior: 'DIR-CH' });
  });

  it('previews without writing: what is created, changed and rejected (M2-18)', async () => {
    const deps = await seededDeps();
    const before = await deps.repo.load();
    const admin = { personId: person(before.state, 'P-0001').id };

    const preview = await importOrganization({ mode: 'preview', files }, admin, deps);
    expect(preview.summary).toEqual({ create: 1, change: 1, unchanged: 0, error: 1 });
    expect(preview.items.find((i) => i.action === 'error')).toMatchObject({ sheet: 'areas', row: 3, key: 'CH-XXX' });

    const after = await deps.repo.load();
    expect(after.state).toEqual(before.state);
    expect(after.dataAsOf).toBe(before.dataAsOf);
  });

  it('applies the valid rows, skips the rejected one and keeps history', async () => {
    const deps = await seededDeps();
    const admin = { personId: person((await deps.repo.load()).state, 'P-0001').id };

    await importOrganization({ mode: 'apply', files }, admin, deps);
    const { state } = await deps.repo.load();
    expect(unit(state, 'CH-CAP').parentId).toBe(unit(state, 'DIR-CH').id);
    expect(unit(state, 'CH-REC').name).toBe('Reclutamiento y Selección');
    expect(state.orgUnits.some((u) => u.code === 'CH-XXX')).toBe(false);

    const history = await deps.repo.history(unit(state, 'CH-REC').id);
    expect(history.map((r) => (r.data as { name: string }).name)).toEqual(['Reclutamiento', 'Reclutamiento y Selección']);
    expect(history[1]!.supersedesId).toBe(history[0]!.rowId);
    expect(history[1]!.source).toMatch(/^import:/);
  });

  it('changes nothing when the same file is loaded twice (M2-19, R-11)', async () => {
    const deps = await seededDeps();
    const admin = { personId: person((await deps.repo.load()).state, 'P-0001').id };
    await importOrganization({ mode: 'apply', files }, admin, deps);
    const first = await deps.repo.load();

    const again = await importOrganization({ mode: 'apply', files }, admin, deps);
    expect(again.summary).toEqual({ create: 0, change: 0, unchanged: 2, error: 1 });
    const second = await deps.repo.load();
    expect(second.state).toEqual(first.state);
    expect(second.dataAsOf).toBe(first.dataAsOf);
  });

  it('reloading the whole seed is a no-op', async () => {
    const deps = await seededDeps();
    const admin = { personId: person((await deps.repo.load()).state, 'P-0001').id };
    const again = await importOrganization({ mode: 'apply', files: [{ name: 'seed.json', text: SEED_TEXT }] }, admin, deps);
    expect(again.summary.create + again.summary.change + again.summary.error).toBe(0);
  });

  it('lets anyone preview but only an administrator apply (M2-16)', async () => {
    const deps = await seededDeps();
    const supervisor = { personId: person((await deps.repo.load()).state, 'P-0004').id };
    await expect(importOrganization({ mode: 'preview', files }, supervisor, deps)).resolves.toBeDefined();
    await expect(importOrganization({ mode: 'apply', files }, supervisor, deps)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
