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

  it('reports a rejected role or equipo on the row of the file it came from', async () => {
    const deps = await seededDeps();
    const admin = { personId: person((await deps.repo.load()).state, 'P-0001').id };
    // P-0004 takes rows 1 to 3; the problems are on rows 2, 3 and 4.
    const text = ['numero_empleado,nombre,rol,area,puesto,equipo', 'P-0004,Persona Prueba Cuatro,supervisor,HID-AGZ1,Supervisor de Cuadrilla,CUADRILLA-A', 'P-0004,Persona Prueba Cuatro,no-existe,HID-AGZ1,,', 'P-0004,Persona Prueba Cuatro,,HID-AGZ2,,SIN-EQUIPO', 'P-0005,Persona Prueba Cinco,capturista,NO-AREA,,'].join('\n');
    const preview = await importOrganization({ mode: 'preview', files: [{ name: 'personas.csv', text }], actor: admin }, deps);
    const errors = preview.items.filter((item) => item.action === 'error').map((item) => `${item.row}: ${item.message}`);
    expect(errors).toEqual(['2: No existe el rol no-existe.', '3: No existe el equipo HID-AGZ2/SIN-EQUIPO.', '4: No existe el área NO-AREA.']);
  });

  it('says where each row lands and why a rejected one was (M2-28)', async () => {
    const deps = await seededDeps();
    const state = (await deps.repo.load()).state;
    const admin = { personId: person(state, 'P-0001').id };
    const areas = ['codigo,nombre,tipo,area_superior', 'HID-PROP,Propagación,area,DIR-HID', 'X-1,Sin padre,area,NADA'].join('\n');
    const personas = ['numero_empleado,nombre,rol,area,puesto,equipo', 'P-0004,Persona Prueba Cuatro,supervisor,HID-PROP,,', 'P-0005,Persona Prueba Cinco,no-existe,HID-AGZ1,,'].join('\n');
    const { items } = await importOrganization({ mode: 'preview', files: [{ name: 'areas.csv', text: areas }, { name: 'personas.csv', text: personas }], actor: admin }, deps);
    const find = (key: string) => items.find((item) => item.key === key);

    // A new área names its parent, so the screen can place it in a branch before it exists.
    expect(find('HID-PROP')).toMatchObject({ entity: 'orgUnit', action: 'create', orgUnitCode: 'HID-PROP', parentCode: 'DIR-HID', cause: null });
    expect(find('X-1')).toMatchObject({ entity: 'orgUnit', action: 'error', cause: 'parentMissing' });
    expect(find('P-0004')).toMatchObject({ entity: 'person', orgUnitCode: null, personId: null });
    expect(find('P-0004 · supervisor en HID-PROP')).toMatchObject({ entity: 'roleAssignment', action: 'create', orgUnitCode: 'HID-PROP', personId: person(state, 'P-0004').id });
    expect(find('P-0005 · no-existe en HID-AGZ1')).toMatchObject({ entity: 'roleAssignment', action: 'error', cause: 'roleMissing', personId: person(state, 'P-0005').id });
  });

  it('names one person once, whichever identifiers their rows use (M2-28)', async () => {
    const deps = await seededDeps();
    const state = (await deps.repo.load()).state;
    const admin = person(state, 'P-0001');
    const personas = ['cuenta,numero_empleado,nombre,rol,area,puesto,equipo', 'admin.demo@origo.test,P-0001,Administrador Demo,supervisor,HID-AGZ1,,', ',P-0001,Administrador Demo,supervisor,HID-AGZ2,,'].join('\n');
    const { items } = await importOrganization({ mode: 'preview', files: [{ name: 'personas.csv', text: personas }], actor: { personId: admin.id } }, deps);
    const given = items.filter((item) => item.entity === 'roleAssignment');
    expect(given.map((item) => item.action)).toEqual(['create', 'create']);
    expect(new Set(given.map((item) => item.personId))).toEqual(new Set([admin.id]));
  });

  it('previews without writing: what is created, changed and rejected (M2-18)', async () => {
    const deps = await seededDeps();
    const before = await deps.repo.load();
    const admin = { personId: person(before.state, 'P-0001').id };

    const preview = await importOrganization({ mode: 'preview', files, actor: admin }, deps);
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
    await expect(importOrganization({ mode: 'preview', files, actor: supervisor }, deps)).resolves.toBeDefined();
    await expect(importOrganization({ mode: 'apply', files, actor: supervisor }, deps)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('applies only a preview of the same files, by the same person, on an unchanged organization (M2-18)', async () => {
    const deps = await seededDeps();
    const { state } = await deps.repo.load();
    const admin = { personId: person(state, 'P-0001').id };
    const apply = (previewId?: string, input = files, actor = admin) => importOrganization({ mode: 'apply', files: input, previewId, actor }, deps);

    await expect(apply()).rejects.toMatchObject({ code: 'PREVIEW_REQUIRED' });
    const preview = await importOrganization({ mode: 'preview', files, actor: admin }, deps);
    await expect(apply(preview.importRunId, [{ name: 'areas.csv', text: `${AREAS_CSV}\r\nCH-NEW,Otra,area,DIR-CH` }])).rejects.toMatchObject({ code: 'PREVIEW_REQUIRED' });
    const byOther = await importOrganization({ mode: 'preview', files, actor: { personId: person(state, 'P-0004').id } }, deps);
    await expect(apply(byOther.importRunId)).rejects.toMatchObject({ code: 'PREVIEW_REQUIRED' });

    await saveEntities({ changes: [{ kind: 'orgUnit', data: { ...unit(state, 'OPS-LOG'), name: 'Logística y Embarques' } }], actor: admin }, deps);
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
