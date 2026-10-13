import type { OrganizationView } from '@origo/capital-humano';

export interface TabProps {
  org: OrganizationView;
  /** True when the person in session is an Administrador de Origo (spec M2-16). */
  canEdit: boolean;
  onHistory: (entityId: string, title: string) => void;
  mode: 'dark' | 'light';
  /** Área filter: ids of the chosen área and everything under it, or null for the whole organization. */
  scope: ReadonlySet<string> | null;
  /** Narrows every screen to one área (null clears the filter). */
  onScope: (orgUnitId: string | null) => void;
}

export const READ_ONLY_HINT = 'Solo un Administrador de Origo puede cambiar la organización';
