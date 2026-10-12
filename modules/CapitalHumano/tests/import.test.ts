import { describe, expect, it } from 'vitest';
import { getOrganization } from '../application/getOrganization';
import { importOrganization } from '../application/importOrganization';
import { parseCsv } from '../application/importOrganization/parseFiles';
import { saveEntities } from '../application/saveEntities';
import { ForbiddenError } from '../domain/errors';
import { SEED_TEXT, load, person, seededDeps, unit } from './helpers';

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

    await load(files, admin, deps);
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
    await load(files, admin, deps);
    const first = await deps.repo.load();

    const again = await load(files, admin, deps);
    expect(again.summary).toEqual({ create: 0, change: 0, unchanged: 2, error: 1 });
    const second = await deps.repo.load();
    expect(second.state).toEqual(first.state);
    expect(second.dataAsOf).toBe(first.dataAsOf);
  });

  it('reloading the whole seed is a no-op', async () => {
    const deps = await seededDeps();
    const admin = { personId: person((await deps.repo.load()).state, 'P-0001').id };
    const again = await load([{ name: 'seed.json', text: SEED_TEXT }], admin, deps);
    expect(again.summary.create + again.summary.change + again.summary.error).toBe(0);
  });

  it('lets anyone preview but only an administrator apply (M2-16)', async () => {
    const deps = await seededDeps();
    const supervisor = { personId: person((await deps.repo.load()).state, 'P-0004').id };
    await expect(importOrganization({ mode: 'preview', files }, supervisor, deps)).resolves.toBeDefined();
    await expect(importOrganization({ mode: 'apply', files }, supervisor, deps)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('applies only a preview of the same files, by the same person, on an unchanged organization (M2-18)', async () => {
    const deps = await seededDeps();
    const { state } = await deps.repo.load();
    const admin = { personId: person(state, 'P-0001').id };
    const apply = (previewId?: string, input = files, actor = admin) => importOrganization({ mode: 'apply', files: input, previewId }, actor, deps);

    await expect(apply()).rejects.toMatchObject({ code: 'PREVIEW_REQUIRED' });
    const preview = await importOrganization({ mode: 'preview', files }, admin, deps);
    await expect(apply(preview.importRunId, [{ name: 'areas.csv', text: `${AREAS_CSV}\r\nCH-NEW,Otra,area,DIR-CH` }])).rejects.toMatchObject({ code: 'PREVIEW_REQUIRED' });
    const byOther = await importOrganization({ mode: 'preview', files }, { personId: person(state, 'P-0004').id }, deps);
    await expect(apply(byOther.importRunId)).rejects.toMatchObject({ code: 'PREVIEW_REQUIRED' });

    await saveEntities({ changes: [{ kind: 'orgUnit', data: { ...unit(state, 'OPS-LOG'), name: 'Logística y Embarques' } }] }, admin, deps);
    await expect(apply(preview.importRunId)).rejects.toMatchObject({ code: 'PREVIEW_STALE' });
    expect((await deps.repo.load()).state.orgUnits.some((u) => u.code === 'CH-CAP')).toBe(false);
  });

  it('rejects codes repeated inside one file instead of letting the last row win (M2-18)', async () => {
    const deps = await seededDeps();
    const admin = { personId: person((await deps.repo.load()).state, 'P-0001').id };
    const text = JSON.stringify({
      roles: [{ code: 'auditor', name: 'Auditor' }, { code: 'AUDITOR', name: 'Auditor repetido' }],
      teams: [
        { orgUnitCode: 'OPS-LOG', code: 'RUTAS', name: 'Rutas' },
        { orgUnitCode: 'ops-log', code: 'rutas', name: 'Rutas repetido' },
      ],
    });
    const result = await load([{ name: 'carga.json', text }], admin, deps);
    expect(result.items.filter((i) => i.action === 'error').map((i) => `${i.sheet}:${i.row}`)).toEqual(['roles:2', 'equipos:2']);
    const { state } = await deps.repo.load();
    expect(state.roles.filter((r) => r.code.toLowerCase() === 'auditor').map((r) => r.name)).toEqual(['Auditor']);
    expect(state.teams.filter((t) => t.code.toLowerCase() === 'rutas').map((t) => t.name)).toEqual(['Rutas']);
  });

  it('keeps the lead an equipo had when the file names one who is not a member (R-08)', async () => {
    const deps = await seededDeps();
    const before = (await deps.repo.load()).state;
    const admin = { personId: person(before, 'P-0001').id };
    const text = JSON.stringify({
      teams: [
        { orgUnitCode: 'HID-AGZ1', code: 'CUADRILLA-A', name: 'Cuadrilla A', leadKey: 'P-0006' },
        { orgUnitCode: 'OPS-LOG', code: 'RUTAS', name: 'Rutas', leadKey: 'P-0006' },
      ],
    });
    const result = await load([{ name: 'carga.json', text }], admin, deps);
    expect(result.items.filter((i) => i.action === 'error').map((i) => i.row)).toEqual([1, 2]);
    const { state } = await deps.repo.load();
    const lead = (code: string) => state.teams.find((t) => t.code === code)!.leadPersonId;
    expect(lead('CUADRILLA-A')).toBe(person(before, 'P-0004').id);
    expect(lead('RUTAS')).toBeNull();
  });

  it('keeps the code of a system role exactly as stored', async () => {
    const deps = await seededDeps();
    const admin = { personId: person((await deps.repo.load()).state, 'P-0001').id };
    const text = JSON.stringify({ roles: [{ code: 'ADMINISTRADOR_ORIGO', name: 'Administrador de Origo', description: 'Puede cambiar la organización' }] });
    await load([{ name: 'carga.json', text }], admin, deps);
    const { state } = await deps.repo.load();
    expect(state.roles.find((r) => r.isSystem)!.code).toBe('administrador_origo');
  });

  it('remembers whether everything loaded so far was declared invented', async () => {
    const deps = await seededDeps();
    expect((await getOrganization(undefined, deps)).isTestData).toBe(true);
    const admin = { personId: person((await deps.repo.load()).state, 'P-0001').id };
    await load(files, admin, deps);
    expect((await getOrganization(undefined, deps)).isTestData).toBe(false);
  });
});
