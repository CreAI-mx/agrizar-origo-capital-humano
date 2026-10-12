import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import type { OrganizationView } from '../application/getOrganization';
import { buildApp } from '../infrastructure/onpremise/app';
import { seededDeps } from './helpers';

// The demo script of docs/spec/functional-spec.md §1.5, step by step, through the HTTP API.
let app: FastifyInstance;
let adminId: string;
const get = async <T>(url: string) => (await app.inject({ method: 'GET', url })).json() as T;
const post = (url: string, payload: unknown, userId = adminId) =>
  app.inject({ method: 'POST', url, payload: payload as object, headers: { 'x-origo-user': userId } });
const org = () => get<OrganizationView>('/api/organization');
const save = (changes: { kind: string; data: Record<string, unknown> }[], userId?: string) =>
  post('/api/organization/entities', { changes }, userId);

const FILE = {
  name: 'areas.csv',
  text: 'codigo,nombre,tipo,area_superior\nHID-PROP,Propagación,area,DIR-HID\nCH-REC,Atracción de Talento,area,DIR-CH\nX-1,Sin padre,area,NADA',
};

describe('GRZR-31 demo script (AC3)', () => {
  beforeAll(async () => {
    app = buildApp(await seededDeps());
    adminId = (await org()).people.find((p) => p.employeeNumber === 'P-0001')!.id;
  });

  it('1 · shows the test organization with its freshness', async () => {
    const view = await org();
    expect(view.orgUnits).toHaveLength(11);
    expect(view.dataAsOf).toMatch(/^2026-10-12T/);
  });

  it('2 · previews and applies a file: 1 to create, 1 to change, 1 error', async () => {
    const preview = (await post('/api/organization/imports', { mode: 'preview', files: [FILE] })).json();
    expect(preview.summary).toEqual({ create: 1, change: 1, unchanged: 0, error: 1 });
    expect((await org()).orgUnits).toHaveLength(11);

    expect((await post('/api/organization/imports', { mode: 'apply', files: [FILE] })).statusCode).toBe(422);
    expect((await post('/api/organization/imports', { mode: 'apply', files: [FILE], previewId: preview.importRunId })).statusCode).toBe(200);
    const view = await org();
    expect(view.orgUnits.map((u) => u.code)).toContain('HID-PROP');
    expect(view.orgUnits.find((u) => u.code === 'CH-REC')!.name).toBe('Atracción de Talento');
  });

  it('3 · loading the same file again changes nothing', async () => {
    const again = (await post('/api/organization/imports', { mode: 'preview', files: [FILE] })).json();
    expect(again.summary).toEqual({ create: 0, change: 0, unchanged: 2, error: 1 });
  });

  it('4 · creates an equipo with two people and a lead', async () => {
    const view = await org();
    const orgUnitId = view.orgUnits.find((u) => u.code === 'HID-PROP')!.id;
    const [lead, member] = [view.people.find((p) => p.employeeNumber === 'P-0006')!, view.people.find((p) => p.employeeNumber === 'P-0007')!];
    const response = await save([
      { kind: 'team', data: { id: 'team-prop', orgUnitId, code: 'SIEMBRA', name: 'Siembra', leadPersonId: lead.id } },
      { kind: 'teamMembership', data: { teamId: 'team-prop', personId: lead.id } },
      { kind: 'teamMembership', data: { teamId: 'team-prop', personId: member.id } },
    ]);
    expect(response.statusCode).toBe(200);
    expect((await org()).teamMemberships.filter((m) => m.teamId === 'team-prop')).toHaveLength(2);
  });

  it('4b · rejects a lead who is not a member, and saves nothing of that batch', async () => {
    const view = await org();
    const outsider = view.people.find((p) => p.employeeNumber === 'P-0002')!;
    const team = view.teams.find((t) => t.id === 'team-prop')!;
    const response = await save([{ kind: 'team', data: { ...team, name: 'Otro nombre', leadPersonId: outsider.id } }]);
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('LEAD_NOT_MEMBER');
    expect((await org()).teams.find((t) => t.id === 'team-prop')!.name).toBe('Siembra');
  });

  it('5 + 6 · a Supervisor on a dirección covers every área under it', async () => {
    const view = await org();
    const personId = view.people.find((p) => p.employeeNumber === 'P-0007')!.id;
    const direccion = view.orgUnits.find((u) => u.code === 'DIR-HID')!;
    const roleId = view.roles.find((r) => r.code === 'supervisor')!.id;
    expect((await save([{ kind: 'roleAssignment', data: { personId, roleId, orgUnitId: direccion.id } }])).statusCode).toBe(200);

    const access = await get<{ orgUnitIds: string[]; isAdmin: boolean }>(`/api/organization/access/${personId}`);
    const covered = access.orgUnitIds.map((id) => view.orgUnits.find((u) => u.id === id)!.code).sort();
    expect(covered).toEqual(['DIR-HID', 'HID-AGZ1', 'HID-AGZ2', 'HID-PROP']);
    expect(access.isAdmin).toBe(false);
  });

  it('7 · refuses to deactivate a dirección in use and says what is in the way', async () => {
    const direccion = (await org()).orgUnits.find((u) => u.code === 'DIR-HID')!;
    const response = await save([{ kind: 'orgUnit', data: { ...direccion, status: 'inactive' } }]);
    expect(response.statusCode).toBe(422);
    expect(response.json().details).toEqual(expect.arrayContaining(['Área: Propagación', 'Asignación: Persona Prueba Siete']));
  });

  it('8 · shows both versions of the renamed área, who changed it and when', async () => {
    const renamed = (await org()).orgUnits.find((u) => u.code === 'CH-REC')!;
    const history = await get<{ data: { name: string }; actorName: string; source: string }[]>(`/api/organization/history/${renamed.id}`);
    expect(history.map((h) => h.data.name)).toEqual(['Atracción de Talento', 'Reclutamiento']);
    expect(history[0]).toMatchObject({ actorName: 'Administrador Demo' });
    expect(history[0]!.source).toMatch(/^import:/);
  });

  it('8b · a person\'s history includes their roles and equipos, and saving without changes adds nothing (M2-15)', async () => {
    const view = await org();
    const someone = view.people.find((p) => p.employeeNumber === 'P-0007')!;
    const kinds = async () => (await get<{ kind: string }[]>(`/api/organization/history/${someone.id}`)).map((h) => h.kind).sort();
    expect(await kinds()).toEqual(['person', 'roleAssignment', 'teamMembership']);

    expect((await save([{ kind: 'person', data: { ...someone } }])).statusCode).toBe(200);
    expect(await kinds()).toEqual(['person', 'roleAssignment', 'teamMembership']);

    const team = await get<{ kind: string }[]>('/api/organization/history/team-prop');
    expect(team.filter((h) => h.kind === 'teamMembership')).toHaveLength(2);
  });

  it('only an Administrador de Origo can change the organization (M2-16)', async () => {
    const view = await org();
    const supervisorId = view.people.find((p) => p.employeeNumber === 'P-0004')!.id;
    const change = [{ kind: 'role', data: { code: 'nuevo', name: 'Nuevo' } }];
    expect((await save(change, supervisorId)).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/organization/entities', payload: { changes: change } })).statusCode).toBe(403);
    expect((await save([{ kind: 'role', data: { code: 'mal código', name: '' } }])).statusCode).toBe(400);
  });
});
