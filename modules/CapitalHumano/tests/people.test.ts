import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { getPersonProfile } from '../application/getPersonProfile';
import { listPeople } from '../application/listPeople';
import type { Actor, Deps } from '../application/ports';
import { saveEntities } from '../application/saveEntities';
import type { OrganizationState } from '../domain/models';
import { buildApp } from '../infrastructure/onpremise/app';
import { makeDeps, person, role, seededDeps, unit } from './helpers';

// seed/organization.test.json: seven invented people. Dos directs Hidroponía, Tres manages AGZ 1,
// Cuatro leads Cuadrilla A there and Cinco is in it; Seis approves in Operaciones; Siete has no role.
let deps: Deps;
let state: OrganizationState;
let admin: Actor;
const names = (rows: { displayName: string }[]) => rows.map((row) => row.displayName.replace('Persona Prueba ', ''));

beforeEach(async () => {
  deps = await seededDeps();
  state = (await deps.repo.load()).state;
  admin = { personId: person(state, 'P-0001').id };
});

describe('people directory (M2-26)', () => {
  it('pages people by name and counts each tray', async () => {
    const page = await listPeople(undefined, deps);
    expect(names(page.items)).toEqual(['Administrador Demo', 'Cinco', 'Cuatro', 'Dos', 'Seis', 'Siete', 'Tres']);
    expect(page).toMatchObject({ total: 7, page: 1, pageSize: 25, counts: { active: 7, noTeam: 5, noAccount: 6, noRole: 1, inactive: 0 } });
    expect(page.dataAsOf).toMatch(/^2026-10-12T/);

    const second = await listPeople({ page: 2, pageSize: 3 }, deps);
    expect(names(second.items)).toEqual(['Dos', 'Seis', 'Siete']);
    expect(second.total).toBe(7);
  });

  it('answers the last page when asked for one past the end', async () => {
    const page = await listPeople({ page: 9, pageSize: 3 }, deps);
    expect(page.page).toBe(3);
    expect(names(page.items)).toEqual(['Tres']);
  });

  it('searches name, employee number and job title, ignoring case and accents', async () => {
    expect(names((await listPeople({ search: 'CUADRILLA' }, deps)).items)).toEqual(['Cuatro']);
    expect(names((await listPeople({ search: 'hidroponia director' }, deps)).items)).toEqual(['Dos']);
    expect(names((await listPeople({ search: 'p-0006' }, deps)).items)).toEqual(['Seis']);
    expect((await listPeople({ search: 'nadie así' }, deps)).total).toBe(0);
  });

  it('opens a tray, and filters by role and by equipo', async () => {
    expect(names((await listPeople({ tray: 'noRole' }, deps)).items)).toEqual(['Siete']);
    expect((await listPeople({ tray: 'noTeam' }, deps)).total).toBe(5);
    expect(names((await listPeople({ roleId: role(state, 'supervisor').id }, deps)).items)).toEqual(['Cuatro']);
    expect(names((await listPeople({ teamId: state.teams.find((t) => t.code === 'CUADRILLA-A')!.id }, deps)).items)).toEqual(['Cinco', 'Cuatro']);
  });

  it('narrows people and trays to an área and what it has under it', async () => {
    const page = await listPeople({ orgUnitId: unit(state, 'DIR-HID').id }, deps);
    expect(names(page.items)).toEqual(['Cinco', 'Cuatro', 'Dos', 'Tres']);
    expect(page.counts).toEqual({ active: 4, noTeam: 2, noAccount: 4, noRole: 0, inactive: 0 });
  });

  it('describes each person: roles with their path, equipos, what is missing', async () => {
    const cuatro = (await listPeople({ search: 'cuatro' }, deps)).items[0]!;
    expect(cuatro.assignments[0]).toMatchObject({ roleName: 'Supervisor', level: 'supervisor', jobTitle: 'Supervisor de Cuadrilla', orgUnitPath: ['Agrizar (datos de prueba)', 'Hidroponía', 'Operación Hidroponía AGZ 1'] });
    expect(cuatro.teams).toMatchObject([{ name: 'Cuadrilla A', isLead: true, members: 2 }]);
    expect(cuatro.alerts).toEqual(['noAccount']);
  });

  it('keeps inactive people out unless asked for', async () => {
    const seis = person(state, 'P-0006');
    const assignment = state.roleAssignments.find((a) => a.personId === seis.id)!;
    await saveEntities({ changes: [{ kind: 'roleAssignment', data: { ...assignment, status: 'revoked' } }, { kind: 'person', data: { ...seis, status: 'inactive' } }] }, admin, deps);

    expect((await listPeople(undefined, deps)).total).toBe(6);
    expect((await listPeople({ includeInactive: 'true' }, deps)).total).toBe(7);
    const tray = await listPeople({ tray: 'inactive' }, deps);
    expect(names(tray.items)).toEqual(['Seis']);
    expect(tray.items[0]!.alerts).toEqual([]);
    expect(tray.counts).toMatchObject({ active: 6, inactive: 1, noTeam: 4 });
  });

  it('refuses a page size it will not serve', async () => {
    await expect(listPeople({ pageSize: 500 }, deps)).rejects.toBeInstanceOf(ZodError);
  });

  it('answers an empty store', async () => {
    expect(await listPeople(undefined, makeDeps())).toMatchObject({ items: [], total: 0, page: 1, dataAsOf: null });
  });
});

describe('person profile and line of command (M2-27)', () => {
  const profile = (employeeNumber: string) => getPersonProfile({ personId: person(state, employeeNumber).id }, deps);

  it('reads the line of command from equipo leads and área heads', async () => {
    const cinco = await profile('P-0005');
    expect(names(cinco.chain)).toEqual(['Dos', 'Tres', 'Cuatro']);
    expect(cinco.chain[2]).toMatchObject({ title: 'Supervisor de Cuadrilla', orgUnitId: unit(state, 'HID-AGZ1').id });
    expect(names((await profile('P-0004')).reports)).toEqual(['Cinco']);
    expect(names((await profile('P-0003')).reports)).toEqual(['Cuatro']);
    expect(names((await profile('P-0002')).reports)).toEqual(['Tres']);
  });

  it('gives no boss to someone under nobody of the ladder', async () => {
    // Operaciones has only an Aprobador and the empresa only the Administrador: neither is a ladder role.
    expect((await profile('P-0006')).chain).toEqual([]);
    expect((await profile('P-0007')).chain).toEqual([]);
    expect((await profile('P-0002')).chain).toEqual([]);
  });

  it('stops when two people lead an equipo the other belongs to', async () => {
    const [cuatro, cinco] = [person(state, 'P-0004'), person(state, 'P-0005')];
    const embarques = state.teams.find((t) => t.code === 'EMBARQUES')!;
    await saveEntities(
      {
        changes: [
          { kind: 'teamMembership', data: { teamId: embarques.id, personId: cuatro.id } },
          { kind: 'teamMembership', data: { teamId: embarques.id, personId: cinco.id } },
          { kind: 'team', data: { ...embarques, leadPersonId: cinco.id } },
        ],
      },
      admin,
      deps,
    );
    expect(names((await profile('P-0005')).chain)).toEqual(['Cuatro']);
    expect(names((await profile('P-0004')).chain)).toEqual(['Cinco']);
  });

  it('says so when the person does not exist', async () => {
    await expect(getPersonProfile({ personId: 'nobody' }, deps)).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' });
  });
});

describe('people directory over HTTP', () => {
  it('takes its filters from the query string', async () => {
    const app = buildApp(deps);
    const page = await app.inject({ method: 'GET', url: '/api/organization/people?tray=noTeam&pageSize=2&page=2' });
    expect(page.statusCode).toBe(200);
    expect(page.json()).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(page.json().items).toHaveLength(2);

    expect((await app.inject({ method: 'GET', url: '/api/organization/people?pageSize=muchas' })).statusCode).toBe(400);
    const cinco = await app.inject({ method: 'GET', url: `/api/organization/people/${person(state, 'P-0005').id}` });
    expect(names(cinco.json().chain)).toEqual(['Dos', 'Tres', 'Cuatro']);
    expect((await app.inject({ method: 'GET', url: '/api/organization/people/nobody' })).statusCode).toBe(422);
  });

  it('follows the people-directory contract', async () => {
    const schema = JSON.parse(readFileSync(resolve(__dirname, '../../../contracts/people-directory.schema.json'), 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    ajv.addSchema(schema);
    const pageOk = ajv.getSchema(`${schema.$id}#/$defs/peoplePage`)!;
    const profileOk = ajv.getSchema(`${schema.$id}#/$defs/personProfile`)!;
    for (const store of [deps, makeDeps()]) {
      pageOk(JSON.parse(JSON.stringify(await listPeople(undefined, store))));
      expect(pageOk.errors ?? []).toEqual([]);
    }
    profileOk(JSON.parse(JSON.stringify(await getPersonProfile({ personId: person(state, 'P-0005').id }, deps))));
    expect(profileOk.errors ?? []).toEqual([]);
  });
});
