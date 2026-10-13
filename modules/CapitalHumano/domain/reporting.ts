import type { OrganizationState } from './models';
import { levelRank } from './peopleDirectory';

// Line of command (spec M2-27). Nobody captures "reports to" per person, so it is read from the
// organization itself.
// ASSUMPTION: a person answers to the lead of their equipo; otherwise to whoever holds the
// highest ladder role on their área, or on the nearest área above that has one. Capital Humano
// has not confirmed this reading.

export interface PersonRef {
  id: string;
  displayName: string;
  /** Job title of their main role, or the role's name. */
  title: string | null;
  /** Área of their main role; null when they hold no role. */
  orgUnitId: string | null;
}

export interface Reporting {
  /** Who the person answers to, or null at the top or when it cannot be told. */
  bossOf(personId: string): string | null;
  /** From the top of the organization down to the person's boss. */
  chainOf(personId: string): PersonRef[];
  /** Everyone who answers to the person, by name. */
  reportsOf(personId: string): PersonRef[];
  ref(personId: string): PersonRef | null;
}

export function buildReporting(state: OrganizationState): Reporting {
  const people = new Map(state.people.filter((p) => p.status === 'active').map((p) => [p.id, p]));
  const roles = new Map(state.roles.map((r) => [r.id, r]));
  const units = new Map(state.orgUnits.map((u) => [u.id, u]));

  // Main role of each person and head of each área: the highest of the ladder, first one wins a tie.
  const main = new Map<string, { orgUnitId: string; rank: number; title: string | null }>();
  const head = new Map<string, { personId: string; rank: number }>();
  for (const a of state.roleAssignments) {
    if (a.status !== 'active' || !people.has(a.personId)) continue;
    const role = roles.get(a.roleId);
    const rank = levelRank(role?.level ?? null);
    const current = main.get(a.personId);
    if (!current || rank < current.rank) main.set(a.personId, { orgUnitId: a.orgUnitId, rank, title: a.jobTitle ?? role?.name ?? null });
    // Only ladder roles head an área: an access role such as Aprobador is not a boss.
    if (role?.level) {
      const leading = head.get(a.orgUnitId);
      if (!leading || rank < leading.rank) head.set(a.orgUnitId, { personId: a.personId, rank });
    }
  }

  // Lead of the first equipo, by name, that each person belongs to.
  const teams = new Map(state.teams.filter((t) => t.status === 'active').map((t) => [t.id, t]));
  const leadOf = new Map<string, { personId: string; team: string }>();
  for (const m of state.teamMemberships) {
    const team = m.status === 'active' ? teams.get(m.teamId) : undefined;
    const lead = team?.leadPersonId;
    if (!team || !lead || lead === m.personId || !people.has(lead)) continue;
    const current = leadOf.get(m.personId);
    if (!current || team.name.localeCompare(current.team, 'es') < 0) leadOf.set(m.personId, { personId: lead, team: team.name });
  }

  const bossOf = (personId: string): string | null => {
    if (!people.has(personId)) return null;
    const lead = leadOf.get(personId);
    if (lead) return lead.personId;
    let unit = units.get(main.get(personId)?.orgUnitId ?? '');
    for (let depth = 0; unit && depth < 32; depth += 1) {
      const leading = head.get(unit.id);
      if (leading && leading.personId !== personId) return leading.personId;
      unit = unit.parentId ? units.get(unit.parentId) : undefined;
    }
    return null;
  };

  const ref = (personId: string): PersonRef | null => {
    const person = people.get(personId) ?? state.people.find((p) => p.id === personId);
    if (!person) return null;
    const role = main.get(personId);
    return { id: person.id, displayName: person.displayName, title: role?.title ?? null, orgUnitId: role?.orgUnitId ?? null };
  };

  return {
    bossOf,
    ref,
    chainOf(personId) {
      const chain: PersonRef[] = [];
      const seen = new Set([personId]);
      // The guard stops a loop, e.g. two people who each lead an equipo the other belongs to.
      for (let boss = bossOf(personId); boss && !seen.has(boss); boss = bossOf(boss)) {
        seen.add(boss);
        chain.unshift(ref(boss)!);
      }
      return chain;
    },
    reportsOf(personId) {
      return [...people.keys()]
        .filter((id) => bossOf(id) === personId)
        .map((id) => ref(id)!)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
    },
  };
}
