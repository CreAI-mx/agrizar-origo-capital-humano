import type { OrgUnit } from '@origo/capital-humano';
import type { ReactNode } from 'react';
import { sortUnits } from './lib';

// Crop identity of the organization (docs/adr/ADR-0002-crop-identity.md). The six crops are the
// ones Agrizar grows: tomato, bell pepper and cucumber in greenhouses; raspberry, blackberry and
// blueberry in macro-tunnels (Origo project overview, "Crops" row).
export const CROPS = ['pimiento', 'tomate', 'pepino', 'frambuesa', 'zarzamora', 'arandano'] as const;
export type Crop = (typeof CROPS)[number];

export const CROP_NAME: Record<Crop, string> = {
  pimiento: 'Pimiento morrón',
  tomate: 'Tomate',
  pepino: 'Pepino',
  frambuesa: 'Frambuesa',
  zarzamora: 'Zarzamora',
  arandano: 'Arándano',
};

/** The branches that hang directly from the empresa, in the order the diagrams draw them. */
const branches = (units: OrgUnit[]) => {
  const roots = new Set(units.filter((u) => u.parentId === null).map((u) => u.id));
  return sortUnits(units.filter((u) => u.parentId !== null && roots.has(u.parentId)));
};

/** The branch each área hangs from; the empresa and anything detached from it have none. */
export function branchOf(units: OrgUnit[]): Map<string, string> {
  const byId = new Map(units.map((u) => [u.id, u]));
  const heads = new Set(branches(units).map((u) => u.id));
  const found = new Map<string, string>();
  for (const unit of units) {
    // The set stops a loop in bad data; a tree of any depth is walked to its branch.
    const seen = new Set<string>();
    let current: OrgUnit | undefined = unit;
    while (current && !heads.has(current.id) && !seen.has(current.id)) {
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    if (current && heads.has(current.id)) found.set(unit.id, current.id);
  }
  return found;
}

/**
 * Crop of every área: each branch under the empresa takes the next crop, and everything under
 * it inherits it. The empresa has none. Pass every área, active or not and whatever the filter,
 * so a branch keeps its crop when another one is hidden.
 * ASSUMPTION: which branch gets which crop carries no meaning; it only tells branches apart.
 */
export function cropsOf(units: OrgUnit[]): Map<string, Crop> {
  const ofBranch = new Map(branches(units).map((unit, index) => [unit.id, CROPS[index % CROPS.length]!]));
  return new Map([...branchOf(units)].map(([unitId, branchId]) => [unitId, ofBranch.get(branchId)!]));
}

/** Which áreas wear a seal: the empresa a sprout, each branch under it its crop. */
export function sealsOf(units: OrgUnit[]): Map<string, Crop | 'brote'> {
  const crops = cropsOf(units);
  const seals = new Map<string, Crop | 'brote'>();
  for (const unit of units) if (unit.parentId === null) seals.set(unit.id, 'brote');
  for (const unit of branches(units)) seals.set(unit.id, crops.get(unit.id)!);
  return seals;
}

export interface CropLegendEntry {
  id: string;
  crop: Crop;
  label: string;
}

/**
 * Which crop stands for which branch, for the branches with a card on screen. `shownIds` are the
 * áreas the diagram draws, so the legend lists a branch exactly when one of its cards is there:
 * an área inside it is enough, an inactive branch counts when it is drawn, and a branch with
 * nothing drawn is left out.
 */
export function cropLegend(units: OrgUnit[], shownIds: Iterable<string>): CropLegendEntry[] {
  const crops = cropsOf(units);
  const branch = branchOf(units);
  const shown = new Set([...shownIds].map((id) => branch.get(id)));
  return branches(units)
    .filter((unit) => shown.has(unit.id))
    .map((unit) => ({ id: unit.id, crop: crops.get(unit.id)!, label: unit.name }));
}

/** Steps of a load, told as the life of a crop: what is sown, what sprouts, what is harvested. */
export type Stage = 'semilla' | 'brote' | 'fruto';

const GLYPH: Record<Crop | 'brote' | 'semilla', ReactNode> = {
  semilla: (
    <>
      <path d="M12 4c4 3 6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 2-7 6-10z" />
      <path d="M12 10v8" />
    </>
  ),
  pimiento: (
    <>
      <path d="M12 7c-1.2-1.3-3.6-1.5-5 .1C5.4 8.9 5.6 12 6.3 14.8c.6 2.4 1.6 4.7 3.4 4.7 1 0 1.5-.6 2.3-.6s1.3.6 2.3.6c1.8 0 2.8-2.3 3.4-4.7.7-2.8.9-5.9-.7-7.7-1.4-1.6-3.8-1.4-5-.1z" />
      <path d="M12 7c0-1.6.6-2.8 2-3.4" />
      <path d="M9.3 10c-.4 2-.3 4 .3 6" />
    </>
  ),
  tomate: (
    <>
      <ellipse cx="12" cy="14" rx="7.2" ry="6.2" />
      <path d="M12 8.6V4.4M12 8.6 8.8 6.6M12 8.6l3.2-2M12 8.6 8.2 9.8M12 8.6l3.8 1.2" />
    </>
  ),
  pepino: (
    <g transform="rotate(42 12 12)">
      <rect x="8.6" y="2.6" width="6.8" height="18.8" rx="3.4" />
      <path d="M12 7.5v.01M12 12v.01M12 16.5v.01" />
    </g>
  ),
  frambuesa: (
    <>
      <path d="M12 20.6c-3.4-1.6-6-4.8-6-8.2 0-2.3 1.8-4 4-4 .8 0 1.5.2 2 .6.5-.4 1.2-.6 2-.6 2.2 0 4 1.7 4 4 0 3.4-2.6 6.6-6 8.2z" />
      <path d="M9.6 12.2v.01M12 12.2v.01M14.4 12.2v.01M10.8 14.8v.01M13.2 14.8v.01M12 17.4v.01" />
      <path d="M12 9V6.4M12 6.4c-1.5 0-2.7-.7-3.3-1.9M12 6.4c1.5 0 2.7-.7 3.3-1.9" />
    </>
  ),
  zarzamora: (
    <>
      <circle cx="9.9" cy="8.9" r="2.1" />
      <circle cx="14.1" cy="8.9" r="2.1" />
      <circle cx="7.9" cy="12.5" r="2.1" />
      <circle cx="12" cy="12.5" r="2.1" />
      <circle cx="16.1" cy="12.5" r="2.1" />
      <circle cx="9.9" cy="16.1" r="2.1" />
      <circle cx="14.1" cy="16.1" r="2.1" />
      <circle cx="12" cy="19.6" r="2.1" />
      <path d="M12 6.9V4.2c1-1.3 2.6-1.7 4-1.1" />
    </>
  ),
  arandano: (
    <>
      <circle cx="12" cy="12.5" r="7.6" />
      <path d="M12 9.3l.9 1.7 1.9.2-1.4 1.3.4 1.9-1.8-.9-1.8.9.4-1.9-1.4-1.3 1.9-.2z" />
    </>
  ),
  // The empresa carries a sprout instead of a crop.
  brote: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c0-3.6 2.6-6 7-6 0 3.6-2.6 6-7 6z" />
      <path d="M12 15c0-2.8-2-4.8-6-4.8 0 2.8 2 4.8 6 4.8z" />
    </>
  ),
};

/** The crop drawn inside a filled circle. Decorative: the name next to it carries the meaning. */
export function CropSeal({ crop, size = 44 }: { crop: Crop | 'brote'; size?: number }) {
  return (
    <svg className="crop-seal" data-crop={crop} width={size} height={size} viewBox="-7 -7 38 38" aria-hidden="true">
      {GLYPH[crop]}
    </svg>
  );
}

/** A step of a load as a seal. Its colors follow the state of the step, not a crop. */
export function StageSeal({ stage, size = 40 }: { stage: Stage; size?: number }) {
  return (
    <svg className="stage-seal" width={size} height={size} viewBox="-7 -7 38 38" aria-hidden="true">
      {GLYPH[stage === 'fruto' ? 'tomate' : stage]}
    </svg>
  );
}

/** A dot in the crop's color, for lists and tables where a seal would be too much. */
export function CropDot({ crop }: { crop: Crop | undefined }) {
  return crop ? <span className="crop-dot" data-crop={crop} aria-hidden="true" /> : null;
}
