import { z } from 'zod';
import { ROLE_LEVELS, type OrganizationState, type Person, type Role } from './models';
import { normalize } from './rules';

// The people directory (spec M2-26): one page of people at a time, searched and filtered where
// the data lives, so the Back Office never needs everyone in memory.

/** What can be missing on an active person. Each one is a tray of work for Capital Humano. */
export const PEOPLE_ALERTS = ['noTeam', 'noAccount', 'noRole'] as const;
export type PeopleAlert = (typeof PEOPLE_ALERTS)[number];
export const PEOPLE_TRAYS = [...PEOPLE_ALERTS, 'inactive'] as const;
export type PeopleTray = (typeof PEOPLE_TRAYS)[number];

const optionalId = z
  .string()
  .trim()
  .min(1)
  .nullish()
  .transform((value) => value ?? null);
// Query strings carry booleans as text.
const flag = z
  .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
  .default(false);

export const peopleQuerySchema = z.object({
  /** Words to find in the name, account, employee number or job title; all must match. */
  search: z.string().trim().max(120).default(''),
  tray: z
    .enum(PEOPLE_TRAYS)
    .nullish()
    .transform((value) => value ?? null),
  /** A role; with an área, the role has to be given there or under it. */
  roleId: optionalId,
  /** With a role and an área: only the role given on that área itself, not under it. */
  roleHere: flag,
  /** An área: people with a role there or under it, or in an equipo there or under it. */
  orgUnitId: optionalId,
  teamId: optionalId,
  includeInactive: flag,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PeopleQuery = z.infer<typeof peopleQuerySchema>;
export type PeopleQueryInput = z.input<typeof peopleQuerySchema>;

export interface PersonRow {
  id: string;
  displayName: string;
  account: string | null;
  employeeNumber: string | null;
  status: Person['status'];
  /** Active roles, the highest of the ladder first. */
  assignments: {
    id: string;
    roleId: string;
    roleName: string;
    level: Role['level'];
    orgUnitId: string;
    orgUnitName: string;
    /** Names from the empresa down to the área. */
    orgUnitPath: string[];
    jobTitle: string | null;
  }[];
  teams: { id: string; membershipId: string; name: string; orgUnitId: string; orgUnitName: string; orgUnitPath: string[]; isLead: boolean; members: number }[];
  alerts: PeopleAlert[];
}

export interface PeoplePage {
  items: PersonRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Size of each tray within the chosen área, whatever else is filtered. */
  counts: { active: number } & Record<PeopleTray, number>;
}

/** Position in the ladder: 0 is the top; roles outside the ladder come last. */
export const levelRank = (level: Role['level']): number => (level ? ROLE_LEVELS.indexOf(level) : ROLE_LEVELS.length);

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/** Builds the rows of everyone once; the queries below only read them. */
export function personRows(state: OrganizationState): PersonRow[] {
  const roles = new Map(state.roles.map((r) => [r.id, r]));
  const units = new Map(state.orgUnits.map((u) => [u.id, u]));
  const path = (orgUnitId: string): string[] => {
    const names: string[] = [];
    // The set stops a loop in bad data; a tree of any depth gives its whole path.
    const seen = new Set<string>();
    for (let unit = units.get(orgUnitId); unit && !seen.has(unit.id); unit = unit.parentId ? units.get(unit.parentId) : undefined) {
      seen.add(unit.id);
      names.unshift(unit.name);
    }
    return names;
  };

  const assignments = new Map<string, PersonRow['assignments']>();
  for (const a of state.roleAssignments) {
    if (a.status !== 'active') continue;
    const role = roles.get(a.roleId);
    push(assignments, a.personId, {
      id: a.id,
      roleId: a.roleId,
      roleName: role?.name ?? '',
      level: role?.level ?? null,
      orgUnitId: a.orgUnitId,
      orgUnitName: units.get(a.orgUnitId)?.name ?? '',
      orgUnitPath: path(a.orgUnitId),
      jobTitle: a.jobTitle,
    });
  }

  const activeTeams = new Map(state.teams.filter((t) => t.status === 'active').map((t) => [t.id, t]));
  const members = new Map<string, number>();
  const memberships = state.teamMemberships.filter((m) => m.status === 'active' && activeTeams.has(m.teamId));
  for (const m of memberships) members.set(m.teamId, (members.get(m.teamId) ?? 0) + 1);
  const teams = new Map<string, PersonRow['teams']>();
  for (const m of memberships) {
    const team = activeTeams.get(m.teamId)!;
    push(teams, m.personId, { id: team.id, membershipId: m.id, name: team.name, orgUnitId: team.orgUnitId, orgUnitName: units.get(team.orgUnitId)?.name ?? '', orgUnitPath: path(team.orgUnitId), isLead: team.leadPersonId === m.personId, members: members.get(team.id) ?? 0 });
  }

  return state.people.map((person) => {
    // Ties never fall to the order rows were stored in: the first one is the person's main role and equipo.
    const own = [...(assignments.get(person.id) ?? [])].sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.orgUnitName.localeCompare(b.orgUnitName, 'es') || a.id.localeCompare(b.id));
    const inTeams = [...(teams.get(person.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
    const alerts: PeopleAlert[] = [];
    if (person.status === 'active') {
      if (!inTeams.length) alerts.push('noTeam');
      // ASSUMPTION: the corporate account is what a person will sign in with (ADR-0001, Auth row).
      if (!person.account) alerts.push('noAccount');
      if (!own.length) alerts.push('noRole');
    }
    return { id: person.id, displayName: person.displayName, account: person.account, employeeNumber: person.employeeNumber, status: person.status, assignments: own, teams: inTeams, alerts };
  });
}

/** The área and everything under it, active or not. */
function unitScope(state: OrganizationState, orgUnitId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const unit of state.orgUnits) if (unit.parentId) push(children, unit.parentId, unit.id);
  const found = new Set<string>();
  const pending = [orgUnitId];
  while (pending.length) {
    const id = pending.pop()!;
    if (found.has(id)) continue;
    found.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return found;
}

/** Áreas each person once had a role in or an equipo of, through relationships that ended. */
function formerUnits(state: OrganizationState): Map<string, Set<string>> {
  const former = new Map<string, Set<string>>();
  const add = (personId: string, orgUnitId: string) => former.set(personId, (former.get(personId) ?? new Set<string>()).add(orgUnitId));
  for (const a of state.roleAssignments) if (a.status !== 'active') add(a.personId, a.orgUnitId);
  const teams = new Map(state.teams.map((t) => [t.id, t]));
  for (const m of state.teamMemberships) {
    const team = teams.get(m.teamId);
    if (team && (m.status !== 'active' || team.status !== 'active')) add(m.personId, team.orgUnitId);
  }
  return former;
}

/** One page of the directory, plus the size of each tray. */
export function queryPeople(state: OrganizationState, input: PeopleQueryInput = {}): PeoplePage {
  const query = peopleQuerySchema.parse(input);
  let rows = personRows(state);
  const scope = query.orgUnitId ? unitScope(state, query.orgUnitId) : null;
  if (query.orgUnitId && scope) {
    const former = formerUnits(state);
    // An active person belongs where they are now. An inactive one has no role or equipo left,
    // so they belong where they were: otherwise the inactive tray of an área would stay empty.
    rows = rows.filter(
      (row) =>
        row.assignments.some((a) => scope.has(a.orgUnitId)) ||
        row.teams.some((t) => scope.has(t.orgUnitId)) ||
        (row.status === 'inactive' && [...(former.get(row.id) ?? [])].some((id) => scope.has(id))),
    );
  }

  const counts: PeoplePage['counts'] = { active: 0, noTeam: 0, noAccount: 0, noRole: 0, inactive: 0 };
  for (const row of rows) {
    if (row.status === 'active') counts.active += 1;
    else counts.inactive += 1;
    for (const alert of row.alerts) counts[alert] += 1;
  }

  const tray = query.tray;
  if (tray === 'inactive') rows = rows.filter((row) => row.status === 'inactive');
  else if (tray) rows = rows.filter((row) => row.alerts.includes(tray));
  else if (!query.includeInactive) rows = rows.filter((row) => row.status === 'active');
  if (query.roleId) {
    // The same assignment carries the role and the área, as the roles matrix counts them (spec M2-29).
    const where = (orgUnitId: string) => !scope || (query.roleHere ? orgUnitId === query.orgUnitId : scope.has(orgUnitId));
    rows = rows.filter((row) => row.assignments.some((a) => a.roleId === query.roleId && where(a.orgUnitId)));
  }
  if (query.teamId) rows = rows.filter((row) => row.teams.some((t) => t.id === query.teamId));
  const words = normalize(query.search).split(/\s+/).filter(Boolean);
  if (words.length) {
    rows = rows.filter((row) => {
      const text = normalize([row.displayName, row.account ?? '', row.employeeNumber ?? '', ...row.assignments.map((a) => a.jobTitle ?? '')].join(' '));
      return words.every((word) => text.includes(word));
    });
  }

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es') || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(rows.length / query.pageSize));
  const page = Math.min(query.page, pages);
  return { items: rows.slice((page - 1) * query.pageSize, page * query.pageSize), total: rows.length, page, pageSize: query.pageSize, counts };
}
