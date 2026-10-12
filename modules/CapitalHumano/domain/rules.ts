import { DomainError } from './errors';
import {
  ADMIN_ROLE_CODE,
  COLLECTION,
  type AnyEntity,
  type EntityByKind,
  type EntityKind,
  type OrgUnit,
  type OrganizationState,
  type Person,
  type Role,
  type RoleAssignment,
  type Team,
  type TeamMembership,
} from './models';

// Rule ids (R-xx) refer to docs/spec/data-model-organization.md §3.

/** R-04: codes and names are compared trimmed, case-insensitive and accent-insensitive. */
export const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const KIND_RANK: Record<OrgUnit['kind'], number> = { empresa: 0, direccion: 1, area: 2, subarea: 3 };
const active = <T extends { status: string }>(items: T[]): T[] => items.filter((x) => x.status === 'active');
const sameCode = (a: string, b: string) => normalize(a) === normalize(b);

/** The área itself plus every active área under it (R-09). */
export function descendantIds(state: OrganizationState, orgUnitId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const unit of active(state.orgUnits)) {
    if (unit.parentId) childrenOf.set(unit.parentId, [...(childrenOf.get(unit.parentId) ?? []), unit.id]);
  }
  const found: string[] = [];
  const pending = [orgUnitId];
  while (pending.length) {
    const current = pending.pop()!;
    if (found.includes(current)) continue;
    found.push(current);
    pending.push(...(childrenOf.get(current) ?? []));
  }
  return found;
}

function kindFits(child: OrgUnit['kind'], parent: OrgUnit['kind']): boolean {
  // R-02: a child is never of a higher kind than its parent; a subárea may hang from a subárea.
  return KIND_RANK[child] > KIND_RANK[parent] || (child === 'subarea' && parent === 'subarea');
}

function checkOrgUnit(state: OrganizationState, unit: OrgUnit): void {
  const others = state.orgUnits.filter((u) => u.id !== unit.id);
  const twin = others.find((u) => sameCode(u.code, unit.code));
  if (twin) throw new DomainError('DUPLICATE_CODE', `El código ${unit.code} ya lo usa el área «${twin.name}».`);

  if (unit.status === 'inactive') {
    // R-05
    const blockers = [
      ...active(others)
        .filter((u) => u.parentId === unit.id)
        .map((u) => `Área: ${u.name}`),
      ...active(state.teams)
        .filter((t) => t.orgUnitId === unit.id)
        .map((t) => `Equipo: ${t.name}`),
      ...active(state.roleAssignments)
        .filter((a) => a.orgUnitId === unit.id)
        .map((a) => `Asignación: ${state.people.find((p) => p.id === a.personId)?.displayName ?? a.personId}`),
    ];
    if (blockers.length) {
      throw new DomainError('IN_USE', `No se puede desactivar «${unit.name}» mientras tenga elementos activos.`, blockers);
    }
    return;
  }

  if (unit.parentId === null) {
    // R-01
    if (unit.kind !== 'empresa') {
      throw new DomainError('PARENT_REQUIRED', `«${unit.name}» necesita un área superior: solo la empresa va sin ella.`);
    }
    const root = active(others).find((u) => u.parentId === null);
    if (root) throw new DomainError('SINGLE_ROOT', `Ya existe una raíz («${root.name}»). Solo puede haber una.`);
  } else {
    const parent = others.find((u) => u.id === unit.parentId);
    if (!parent) throw new DomainError('PARENT_NOT_FOUND', `El área superior de «${unit.name}» no existe.`);
    if (parent.status !== 'active') {
      throw new DomainError('PARENT_INACTIVE', `El área superior «${parent.name}» está inactiva.`);
    }
    // R-03: `unit.id` is still under its old parent in `state`, so its descendants are known.
    if (unit.parentId === unit.id || descendantIds(state, unit.id).includes(parent.id)) {
      throw new DomainError('CYCLE', `«${unit.name}» no puede quedar debajo de «${parent.name}»: es una de sus propias áreas.`);
    }
    if (!kindFits(unit.kind, parent.kind)) {
      throw new DomainError('KIND_ORDER', `Un área de tipo ${unit.kind} no puede colgar de una de tipo ${parent.kind}.`);
    }
  }
  const misfit = active(others).find((u) => u.parentId === unit.id && !kindFits(u.kind, unit.kind));
  if (misfit) {
    throw new DomainError('KIND_ORDER', `«${misfit.name}» (${misfit.kind}) no puede colgar de un área de tipo ${unit.kind}.`);
  }
}

function checkRole(state: OrganizationState, role: Role): void {
  const others = state.roles.filter((r) => r.id !== role.id);
  const twin = others.find((r) => sameCode(r.code, role.code));
  if (twin) throw new DomainError('DUPLICATE_CODE', `El código ${role.code} ya lo usa el rol «${twin.name}».`);
  const previous = state.roles.find((r) => r.id === role.id);
  if (previous?.isSystem && (role.status !== 'active' || !sameCode(role.code, previous.code))) {
    throw new DomainError('SYSTEM_ROLE', `«${previous.name}» es un rol del sistema: no se desactiva ni cambia de código.`);
  }
  if (role.status === 'inactive') {
    // R-06
    const holders = active(state.roleAssignments).filter((a) => a.roleId === role.id);
    if (holders.length) {
      throw new DomainError(
        'IN_USE',
        `No se puede desactivar el rol «${role.name}»: ${holders.length} asignaciones activas lo usan.`,
        holders.map((a) => state.people.find((p) => p.id === a.personId)?.displayName ?? a.personId),
      );
    }
  }
}

function checkTeam(state: OrganizationState, team: Team): void {
  if (team.status === 'inactive') {
    // R-07
    const members = active(state.teamMemberships).filter((m) => m.teamId === team.id);
    if (members.length) {
      throw new DomainError('IN_USE', `No se puede desactivar el equipo «${team.name}»: tiene ${members.length} integrantes.`);
    }
    return;
  }
  const unit = state.orgUnits.find((u) => u.id === team.orgUnitId);
  if (!unit || unit.status !== 'active') {
    throw new DomainError('ORG_UNIT_NOT_FOUND', `El área del equipo «${team.name}» no existe o está inactiva.`);
  }
  const twin = state.teams.find((t) => t.id !== team.id && t.orgUnitId === team.orgUnitId && sameCode(t.code, team.code));
  if (twin) throw new DomainError('DUPLICATE_CODE', `El código ${team.code} ya lo usa el equipo «${twin.name}» en «${unit.name}».`);
  if (team.leadPersonId && !active(state.people).some((p) => p.id === team.leadPersonId)) {
    throw new DomainError('PERSON_NOT_FOUND', `El líder del equipo «${team.name}» no existe o está inactivo.`);
  }
}

function checkPerson(state: OrganizationState, person: Person): void {
  const others = state.people.filter((p) => p.id !== person.id);
  if (person.account && others.some((p) => p.account && sameCode(p.account, person.account!))) {
    throw new DomainError('DUPLICATE_ACCOUNT', `La cuenta ${person.account} ya pertenece a otra persona.`);
  }
  if (person.employeeNumber && others.some((p) => p.employeeNumber === person.employeeNumber)) {
    throw new DomainError('DUPLICATE_EMPLOYEE', `El número de empleado ${person.employeeNumber} ya pertenece a otra persona.`);
  }
  if (person.status === 'inactive') {
    const uses =
      active(state.roleAssignments).filter((a) => a.personId === person.id).length +
      active(state.teamMemberships).filter((m) => m.personId === person.id).length;
    if (uses) {
      throw new DomainError('IN_USE', `No se puede desactivar a «${person.displayName}»: tiene ${uses} asignaciones o equipos activos.`);
    }
  }
}

function checkAssignment(state: OrganizationState, assignment: RoleAssignment): void {
  const role = state.roles.find((r) => r.id === assignment.roleId);
  if (assignment.status !== 'active') {
    // Never leave the organization without someone able to change it.
    const admins = active(state.roleAssignments).filter(
      (a) => a.id !== assignment.id && state.roles.find((r) => r.id === a.roleId)?.code === ADMIN_ROLE_CODE,
    );
    if (role?.code === ADMIN_ROLE_CODE && admins.length === 0) {
      throw new DomainError('LAST_ADMIN', 'Debe quedar al menos un Administrador de Origo.');
    }
    return;
  }
  const person = state.people.find((p) => p.id === assignment.personId);
  const unit = state.orgUnits.find((u) => u.id === assignment.orgUnitId);
  if (!person || person.status !== 'active') throw new DomainError('PERSON_NOT_FOUND', 'La persona no existe o está inactiva.');
  if (!role || role.status !== 'active') throw new DomainError('ROLE_NOT_FOUND', 'El rol no existe o está inactivo.');
  if (!unit || unit.status !== 'active') throw new DomainError('ORG_UNIT_NOT_FOUND', 'El área no existe o está inactiva.');
  const twin = active(state.roleAssignments).find(
    (a) => a.id !== assignment.id && a.personId === person.id && a.roleId === role.id && a.orgUnitId === unit.id,
  );
  if (twin) {
    throw new DomainError('DUPLICATE_ASSIGNMENT', `«${person.displayName}» ya tiene el rol «${role.name}» en «${unit.name}».`);
  }
}

function checkMembership(state: OrganizationState, membership: TeamMembership): void {
  if (membership.status !== 'active') return;
  const team = state.teams.find((t) => t.id === membership.teamId);
  const person = state.people.find((p) => p.id === membership.personId);
  if (!team || team.status !== 'active') throw new DomainError('TEAM_NOT_FOUND', 'El equipo no existe o está inactivo.');
  if (!person || person.status !== 'active') throw new DomainError('PERSON_NOT_FOUND', 'La persona no existe o está inactiva.');
  const twin = active(state.teamMemberships).find(
    (m) => m.id !== membership.id && m.teamId === team.id && m.personId === person.id,
  );
  if (twin) throw new DomainError('DUPLICATE_MEMBERSHIP', `«${person.displayName}» ya está en el equipo «${team.name}».`);
}

const CHECKS: { [K in EntityKind]: (state: OrganizationState, entity: EntityByKind[K]) => void } = {
  orgUnit: checkOrgUnit,
  role: checkRole,
  team: checkTeam,
  person: checkPerson,
  roleAssignment: checkAssignment,
  teamMembership: checkMembership,
};

/** Validates one create-or-replace against the current state and returns the state after it. */
export function applyChange<K extends EntityKind>(
  state: OrganizationState,
  kind: K,
  entity: EntityByKind[K],
): OrganizationState {
  CHECKS[kind](state, entity);
  const key = COLLECTION[kind];
  const list = state[key] as AnyEntity[];
  const exists = list.some((x) => x.id === entity.id);
  return { ...state, [key]: exists ? list.map((x) => (x.id === entity.id ? entity : x)) : [...list, entity] };
}

/** R-08, checked once a batch is complete: members are saved after the team that names its lead. */
export function checkTeamLeads(state: OrganizationState): void {
  for (const team of active(state.teams)) {
    if (!team.leadPersonId) continue;
    const isMember = active(state.teamMemberships).some((m) => m.teamId === team.id && m.personId === team.leadPersonId);
    if (!isMember) {
      throw new DomainError('LEAD_NOT_MEMBER', `El líder del equipo «${team.name}» debe ser uno de sus integrantes.`);
    }
  }
}

export interface AccessContext {
  personId: string;
  isAdmin: boolean;
  roles: { roleId: string; code: string; name: string; orgUnitId: string; orgUnitName: string; jobTitle: string | null }[];
  /** Áreas the person's roles cover: each assigned área plus its descendants (R-09). */
  orgUnitIds: string[];
  teamIds: string[];
}

/** Spec M2-09: the one answer other stories ask of the organization tree. */
export function resolveAccessContext(state: OrganizationState, personId: string): AccessContext {
  const person = state.people.find((p) => p.id === personId && p.status === 'active');
  const assignments = person ? active(state.roleAssignments).filter((a) => a.personId === personId) : [];
  const roles = assignments.flatMap((a) => {
    const role = state.roles.find((r) => r.id === a.roleId && r.status === 'active');
    const unit = state.orgUnits.find((u) => u.id === a.orgUnitId && u.status === 'active');
    if (!role || !unit) return [];
    return [{ roleId: role.id, code: role.code, name: role.name, orgUnitId: unit.id, orgUnitName: unit.name, jobTitle: a.jobTitle }];
  });
  const covered = new Set<string>();
  for (const role of roles) for (const id of descendantIds(state, role.orgUnitId)) covered.add(id);
  return {
    personId,
    isAdmin: roles.some((r) => r.code === ADMIN_ROLE_CODE),
    roles,
    orgUnitIds: [...covered],
    teamIds: person
      ? active(state.teamMemberships)
          .filter((m) => m.personId === personId)
          .map((m) => m.teamId)
      : [],
  };
}
