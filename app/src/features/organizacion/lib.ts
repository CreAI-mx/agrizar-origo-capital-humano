import type { OrgUnit, OrganizationView } from '@origo/capital-humano';
import type { ReactNode } from 'react';

export const KIND_LABEL: Record<OrgUnit['kind'], string> = {
  empresa: 'Empresa',
  direccion: 'Dirección',
  area: 'Área',
  subarea: 'Subárea',
};

/** Search ignores case and accents, like the API does for codes. */
export const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/** "1 equipo", "3 equipos" */
export const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Octavio Huerta Tapia" → "OH" */
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

const dateTime = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/** Siblings in their saved order, then by name; parents before children is not required. */
export const sortUnits = (units: OrgUnit[]) => [...units].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));

/** The área and everything under it, active or not. */
export function scopeOf(units: OrgUnit[], orgUnitId: string): Set<string> {
  const found = new Set<string>();
  const pending = [orgUnitId];
  while (pending.length) {
    const id = pending.pop()!;
    if (found.has(id)) continue;
    found.add(id);
    for (const unit of units) if (unit.parentId === id) pending.push(unit.id);
  }
  return found;
}

/**
 * People who belong to the filtered áreas: by a role given there or by an equipo of theirs.
 * An active person belongs where they are now; an inactive one, who has no role or equipo
 * left, where they were.
 */
export function peopleInScope(org: OrganizationView, scope: ReadonlySet<string>): Set<string> {
  const inactive = new Set(org.people.filter((p) => p.status !== 'active').map((p) => p.id));
  const teams = new Map(org.teams.filter((t) => scope.has(t.orgUnitId)).map((t) => [t.id, t]));
  return new Set([
    ...org.roleAssignments.filter((a) => scope.has(a.orgUnitId) && (a.status === 'active' || inactive.has(a.personId))).map((a) => a.personId),
    ...org.teamMemberships.filter((m) => teams.has(m.teamId) && ((m.status === 'active' && teams.get(m.teamId)!.status === 'active') || inactive.has(m.personId))).map((m) => m.personId),
  ]);
}

export interface UnitNode {
  key: string;
  value: string;
  title: ReactNode;
  children: UnitNode[];
}

/** Nested nodes for Tree and TreeSelect, siblings in sort order then by name. */
export function unitTree(units: OrgUnit[], title: (unit: OrgUnit) => ReactNode = (unit) => unit.name): UnitNode[] {
  const byParent = new Map<string | null, OrgUnit[]>();
  const ids = new Set(units.map((u) => u.id));
  for (const unit of units) {
    // A unit whose parent is filtered out is shown at the top rather than lost.
    const parent = unit.parentId && ids.has(unit.parentId) ? unit.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), unit]);
  }
  const build = (parentId: string | null): UnitNode[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'))
      .map((unit) => ({ key: unit.id, value: unit.id, title: title(unit), children: build(unit.id) }));
  return build(null);
}

/** "Agrizar › Capital Humano › Reclutamiento" */
export function unitPath(units: OrgUnit[], id: string | null): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let unit = units.find((u) => u.id === id); unit && !seen.has(unit.id); unit = units.find((u) => u.id === unit!.parentId)) {
    seen.add(unit.id);
    names.unshift(unit.name);
  }
  return names.join(' › ');
}
