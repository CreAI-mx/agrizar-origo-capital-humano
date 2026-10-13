import type { OrgUnit, OrganizationView } from '@origo/capital-humano';
import { ROLE_LEVELS } from '@origo/capital-humano';
import type { ChartItem } from './components/TreeChart';
import { cropsOf, sealsOf } from './crops';
import { KIND_LABEL, count, sortUnits } from './lib';

/** How loud an área's card is: the empresa and the direcciones stand out. */
export const UNIT_TONE: Record<OrgUnit['kind'], ChartItem['tone']> = { empresa: 'root', direccion: 'strong', area: 'normal', subarea: 'normal' };

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
  const crops = cropsOf(org.orgUnits);
  const names = new Map(org.people.map((p) => [p.id, p.displayName]));
  const personName = (id: string) => names.get(id) ?? '';
  const seals = sealsOf(org.orgUnits);
  const rank = (roleId: string) => {
    const level = org.roles.find((r) => r.id === roleId)?.level;
    return level ? ROLE_LEVELS.indexOf(level) : ROLE_LEVELS.length;
  };
  return sortUnits(units).map((unit) => {
    // Ties go by name, like the line of command (domain/reporting.ts), not by stored order.
    const head = assignments.filter((a) => a.orgUnitId === unit.id).sort((a, b) => rank(a.roleId) - rank(b.roleId) || personName(a.personId).localeCompare(personName(b.personId), 'es'))[0];
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
      tone: UNIT_TONE[unit.kind],
      crop: crops.get(unit.id) ?? null,
      seal: seals.get(unit.id) ?? null,
      inactive: unit.status === 'inactive',
    };
  });
}
