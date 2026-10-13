import type { OrganizationView } from '@origo/capital-humano';

export interface TabProps {
  org: OrganizationView;
  /** True when the person in session is an Administrador de Origo (spec M2-16). */
  canEdit: boolean;
  onHistory: (entityId: string, title: string) => void;
  mode: 'dark' | 'light';
  /** Área filter: ids of the chosen área and everything under it, or null for the whole organization. */
  scope: ReadonlySet<string> | null;
  /** The área chosen in the filter, or null. */
  scopeId: string | null;
  /** Narrows every screen to one área (null clears the filter). */
  onScope: (orgUnitId: string | null) => void;
  /** Opens the Áreas diagram on one área. */
  onShowArea: (orgUnitId: string) => void;
  /** The área the Áreas diagram should open on, when another screen asked for it. */
  focusAreaId: string | null;
}

export const READ_ONLY_HINT = 'Solo un Administrador de Origo puede cambiar la organización';
