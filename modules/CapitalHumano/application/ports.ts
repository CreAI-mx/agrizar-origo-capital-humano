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

/**
 * Input of a use case that changes something: what was asked, plus who is acting. The adapter
 * sets `actor` from the session it trusts, after the request body, so a body can never name
 * its own actor. Keeps every use case `(input, deps) => Promise<output>` (ADR-0001).
 */
export type Acting<T> = T & { actor: Actor };

/** Who is acting. `system` is used only by the local seed, which has no user yet. */
export interface Actor {
  personId: string;
  system?: boolean;
}
