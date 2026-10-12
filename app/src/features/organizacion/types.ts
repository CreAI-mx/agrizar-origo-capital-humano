import type { OrganizationView } from '@origo/capital-humano';

export interface TabProps {
  org: OrganizationView;
  /** True when the person in session is an Administrador de Origo (spec M2-16). */
  canEdit: boolean;
  onHistory: (entityId: string, title: string) => void;
}

export const READ_ONLY_HINT = 'Solo un Administrador de Origo puede cambiar la organización';
