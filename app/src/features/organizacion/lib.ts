import type { OrgUnit } from '@origo/capital-humano';
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

const dateTime = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

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
  for (let unit = units.find((u) => u.id === id); unit; unit = units.find((u) => u.id === unit!.parentId)) {
    names.unshift(unit.name);
    if (names.length > 12) break;
  }
  return names.join(' › ');
}
