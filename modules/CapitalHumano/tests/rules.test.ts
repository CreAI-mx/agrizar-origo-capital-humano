import { beforeEach, describe, expect, it } from 'vitest';
import type { OrganizationState } from '../domain/models';
import { applyChange, checkTeamLeads, descendantIds, resolveAccessContext } from '../domain/rules';
import { person, role, seededDeps, unit } from './helpers';

let state: OrganizationState;
beforeEach(async () => {
  state = (await (await seededDeps()).repo.load()).state;
});
const code = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'no error';
};

describe('organization tree (GRZR-31 AC1)', () => {
  it('rejects a second root (R-01)', () => {
    const second = { ...unit(state, 'AGZ'), id: 'x', code: 'OTRA' };
    expect(code(() => applyChange(state, 'orgUnit', second))).toBe('SINGLE_ROOT');
  });

  it('rejects an área without a parent unless it is the empresa (R-01)', () => {
    expect(code(() => applyChange(state, 'orgUnit', { ...unit(state, 'DIR-CH'), parentId: null }))).toBe('PARENT_REQUIRED');
  });

  it('rejects a move under one of its own descendants (R-03)', () => {
    const moved = { ...unit(state, 'DIR-OPS'), parentId: unit(state, 'OPS-MTTO-AGZ2').id };
    expect(code(() => applyChange(state, 'orgUnit', moved))).toBe('CYCLE');
  });

  it('rejects a kind that is not below its parent (R-02)', () => {
    const moved = { ...unit(state, 'DIR-CH'), parentId: unit(state, 'HID-AGZ1').id };
    expect(code(() => applyChange(state, 'orgUnit', moved))).toBe('KIND_ORDER');
  });

  it('allows a valid move and keeps the rest of the tree', () => {
    const moved = { ...unit(state, 'OPS-LOG'), parentId: unit(state, 'DIR-HID').id };
    const next = applyChange(state, 'orgUnit', moved);
    expect(descendantIds(next, unit(next, 'DIR-HID').id)).toContain(moved.id);
    expect(next.orgUnits).toHaveLength(state.orgUnits.length);
  });

  it('never deactivates the root, even with nothing under it (R-01)', () => {
    const root = { ...unit(state, 'AGZ'), id: 'solo', code: 'SOLO' };
    const alone = { ...state, orgUnits: [root], teams: [], roleAssignments: [] };
    expect(code(() => applyChange(alone, 'orgUnit', { ...root, status: 'inactive' }))).toBe('ROOT_REQUIRED');
  });

  it('keeps the tree a tree when inactive áreas are moved (R-03)', () => {
    const off = (codeOf: string) => ({ ...unit(state, codeOf), status: 'inactive' as const });
    let next = applyChange({ ...state, teams: [], roleAssignments: [] }, 'orgUnit', off('OPS-MTTO-AGZ2'));
    next = applyChange(next, 'orgUnit', off('OPS-MTTO'));
    const under = { ...unit(next, 'OPS-MTTO'), parentId: unit(next, 'OPS-MTTO-AGZ2').id };
    expect(code(() => applyChange(next, 'orgUnit', under))).toBe('CYCLE');
    expect(code(() => applyChange(next, 'orgUnit', { ...unit(next, 'OPS-MTTO'), parentId: 'no-existe' }))).toBe('PARENT_NOT_FOUND');
    expect(code(() => applyChange(next, 'orgUnit', { ...unit(next, 'OPS-MTTO'), parentId: unit(next, 'DIR-CH').id }))).toBe('no error');
  });

  it('compares codes ignoring case and accents (R-04)', () => {
    const twin = { ...unit(state, 'CH-REC'), id: 'x', code: 'ch-rec' };
    expect(code(() => applyChange(state, 'orgUnit', twin))).toBe('DUPLICATE_CODE');
  });
});

describe('deactivation guards (M2-08)', () => {
  it('blocks an área with active children, equipos or assignments and names them (R-05)', () => {
    try {
      applyChange(state, 'orgUnit', { ...unit(state, 'HID-AGZ1'), status: 'inactive' });
      expect.unreachable();
    } catch (error) {
      expect((error as { code: string }).code).toBe('IN_USE');
      expect((error as { details: string[] }).details).toContain('Equipo: Cuadrilla A');
    }
  });

  it('allows deactivating an empty área', () => {
    const next = applyChange(state, 'orgUnit', { ...unit(state, 'CH-REC'), status: 'inactive' });
    expect(unit(next, 'CH-REC').status).toBe('inactive');
  });

  it('blocks a role in use and never a system role (R-06)', () => {
    expect(code(() => applyChange(state, 'role', { ...role(state, 'supervisor'), status: 'inactive' }))).toBe('IN_USE');
    expect(code(() => applyChange(state, 'role', { ...role(state, 'administrador_origo'), status: 'inactive' }))).toBe('SYSTEM_ROLE');
  });

  it('keeps the code of a system role byte for byte, so administrators stay administrators', () => {
    const admin = role(state, 'administrador_origo');
    expect(code(() => applyChange(state, 'role', { ...admin, code: 'ADMINISTRADOR_ORIGO' }))).toBe('SYSTEM_ROLE');
    expect(code(() => applyChange(state, 'role', { ...admin, name: 'Administrador' }))).toBe('no error');
  });

  it('blocks an equipo with members (R-07)', () => {
    expect(code(() => applyChange(state, 'team', { ...state.teams[0]!, status: 'inactive' }))).toBe('IN_USE');
  });

  it('never leaves the organization without an administrator', () => {
    const admin = state.roleAssignments.find((a) => a.roleId === role(state, 'administrador_origo').id)!;
    expect(code(() => applyChange(state, 'roleAssignment', { ...admin, status: 'revoked' }))).toBe('LAST_ADMIN');
    // Editing the same assignment into another role removes the administrator just the same.
    expect(code(() => applyChange(state, 'roleAssignment', { ...admin, roleId: role(state, 'gerente').id }))).toBe('LAST_ADMIN');
    const second = applyChange(state, 'roleAssignment', { ...admin, id: 'otro-admin', personId: person(state, 'P-0002').id });
    expect(code(() => applyChange(second, 'roleAssignment', { ...admin, roleId: role(second, 'gerente').id }))).toBe('no error');
  });
});

describe('equipos and assignments', () => {
  it('requires the lead to be a member (R-08)', () => {
    const team = { ...state.teams.find((t) => t.code === 'EMBARQUES')!, leadPersonId: person(state, 'P-0006').id };
    expect(code(() => checkTeamLeads(applyChange(state, 'team', team)))).toBe('LEAD_NOT_MEMBER');
  });

  it('rejects the same role twice on the same área for one person', () => {
    const held = state.roleAssignments.find((a) => a.personId === person(state, 'P-0003').id)!;
    expect(code(() => applyChange(state, 'roleAssignment', { ...held, id: 'x' }))).toBe('DUPLICATE_ASSIGNMENT');
  });
});

describe('who sees what (M2-09)', () => {
  it('covers the assigned área and everything under it (R-09)', () => {
    const access = resolveAccessContext(state, person(state, 'P-0006').id);
    const codes = access.orgUnitIds.map((id) => state.orgUnits.find((u) => u.id === id)!.code).sort();
    expect(codes).toEqual(['DIR-OPS', 'OPS-LOG', 'OPS-MTTO', 'OPS-MTTO-AGZ2']);
    expect(access.isAdmin).toBe(false);
  });

  it('gives nothing to a person without assignments and everything to the administrator', () => {
    expect(resolveAccessContext(state, person(state, 'P-0007').id).orgUnitIds).toEqual([]);
    const admin = resolveAccessContext(state, person(state, 'P-0001').id);
    expect(admin.isAdmin).toBe(true);
    expect(admin.orgUnitIds).toHaveLength(state.orgUnits.length);
  });

  it('lists the equipos a person belongs to', () => {
    expect(resolveAccessContext(state, person(state, 'P-0005').id).teamIds).toEqual([state.teams.find((t) => t.code === 'CUADRILLA-A')!.id]);
  });
});
