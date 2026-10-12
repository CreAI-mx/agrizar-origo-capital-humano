import type { OrgUnit, OrganizationView } from '@origo/capital-humano';
import { ROLE_LEVELS } from '@origo/capital-humano';
import type { ChartItem } from './components/TreeChart';
import { KIND_LABEL, count } from './lib';

const TONE: Record<OrgUnit['kind'], ChartItem['tone']> = { empresa: 'root', direccion: 'strong', area: 'normal', subarea: 'normal' };

/** Siblings in their saved order, then by name; parents before children is not required. */
export const sortUnits = (units: OrgUnit[]) => [...units].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));

/** Área cards for a diagram: head of the área, its job title, and people in it or under it. */
export function areaItems(org: OrganizationView, units: OrgUnit[]): ChartItem[] {
  const assignments = org.roleAssignments.filter((a) => a.status === 'active');
  const childrenOf = new Map<string, OrgUnit[]>();
  for (const unit of units) if (unit.parentId) childrenOf.set(unit.parentId, [...(childrenOf.get(unit.parentId) ?? []), unit]);
  const peopleUnder = (id: string, into = new Set<string>()): Set<string> => {
    for (const a of assignments) if (a.orgUnitId === id) into.add(a.personId);
    for (const child of childrenOf.get(id) ?? []) peopleUnder(child.id, into);
    return into;
  };
  const rank = (roleId: string) => {
    const level = org.roles.find((r) => r.id === roleId)?.level;
    return level ? ROLE_LEVELS.indexOf(level) : ROLE_LEVELS.length;
  };
  return sortUnits(units).map((unit) => {
    const head = assignments.filter((a) => a.orgUnitId === unit.id).sort((a, b) => rank(a.roleId) - rank(b.roleId))[0];
    const people = peopleUnder(unit.id).size;
    const teams = org.teams.filter((t) => t.orgUnitId === unit.id && t.status === 'active').length;
    return {
      id: unit.id,
      parentId: unit.parentId,
      eyebrow: unit.status === 'inactive' ? 'Inactiva' : KIND_LABEL[unit.kind],
      title: unit.name,
      line1: head ? (org.people.find((p) => p.id === head.personId)?.displayName ?? null) : 'Sin responsable asignado',
      line2: head ? (head.jobTitle ?? org.roles.find((r) => r.id === head.roleId)?.name ?? null) : count(teams, 'equipo', 'equipos'),
      badge: people,
      badgeTitle: `${count(people, 'persona', 'personas')} en esta área y las que tiene debajo`,
      tone: TONE[unit.kind],
      inactive: unit.status === 'inactive',
    };
  });
}
