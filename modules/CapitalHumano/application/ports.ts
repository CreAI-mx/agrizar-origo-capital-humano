import type { OrganizationState, VersionRow } from '../domain/models';

export interface LoadedOrganization {
  state: OrganizationState;
  /** Current row id per `${kind}:${entityId}`; the next version must supersede it. */
  currentRowIds: Record<string, string>;
  /** `recordedAt` of the latest organization change, or null when the store is empty. */
  dataAsOf: string | null;
  lastActorId: string | null;
  /** True when every applied load declared its content invented; null when nothing was loaded. */
  isTestData: boolean | null;
}

export interface OrganizationRepository {
  load(): Promise<LoadedOrganization>;
  /** Appends all rows or none. Rejects with ConflictError when a superseded row is no longer current. */
  append(rows: VersionRow[]): Promise<void>;
  history(entityId: string): Promise<VersionRow[]>;
}

export interface Deps {
  repo: OrganizationRepository;
  clock: () => Date;
  newId: () => string;
}

/** Who is acting. `system` is used only by the local seed, which has no user yet. */
export interface Actor {
  personId: string;
  system?: boolean;
}
