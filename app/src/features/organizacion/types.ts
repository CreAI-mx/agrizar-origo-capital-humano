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
  /** Opens Personas on the people who hold a role in an área. */
  onShowPeople: (roleId: string, orgUnitId: string) => void;
  /** The role Personas should open filtered by, when another screen asked for it. */
  focusRoleId: string | null;
  /** That role counts only where it is given on the área itself (the empresa column), not under it. */
  focusRoleHere: boolean;
}

export const READ_ONLY_HINT = 'Solo un Administrador de Origo puede cambiar la organización';
