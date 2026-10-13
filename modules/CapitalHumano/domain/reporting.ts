import type { OrganizationState } from './models';
import { levelRank } from './peopleDirectory';

// Line of command (spec M2-27). Nobody captures "reports to" per person, so it is read from the
// organization itself.
// ASSUMPTION: a person answers to the lead of their equipo; otherwise to whoever holds the
// highest ladder role on their área, as long as it is above their own, or on the nearest área
// above, where it may also be the same level. Capital Humano has not confirmed this reading (spec Q-6).

export interface PersonRef {
  id: string;
  displayName: string;
  /** Job title of their main role, or the role's name. */
  title: string | null;
  /** Área of their main role, or of their first equipo when they hold no role; null with neither. */
  orgUnitId: string | null;
  /**
   * Not empty means the organization does not settle this link. In a chain: the other people
   * who hold the same top role on the área this person stands as head of. In a list of
   * reports: the other heads this person may answer to instead.
   */
  sharedWith: string[];
}

export interface Reporting {
  /** Who the person answers to, or null at the top or when it cannot be told. */
  bossOf(personId: string): string | null;
  /** From the top of the organization down to the person's boss. */
  chainOf(personId: string): PersonRef[];
  /** Everyone who answers to the person, by name, including those who may answer to a co-head instead. */
  reportsOf(personId: string): PersonRef[];
  ref(personId: string): PersonRef | null;
}

interface Link {
  personId: string;
  /** Other heads of the same área at the same level, when the boss was found as an área head. */
  peers: string[];
}

export function buildReporting(state: OrganizationState): Reporting {
  const people = new Map(state.people.filter((p) => p.status === 'active').map((p) => [p.id, p]));
  const roles = new Map(state.roles.map((r) => [r.id, r]));
  const units = new Map(state.orgUnits.map((u) => [u.id, u]));
  const nameOf = (personId: string) => people.get(personId)?.displayName ?? '';
  // Ties never fall to the order rows were stored in: by name, then by id.
  const byName = (a: string, b: string) => nameOf(a).localeCompare(nameOf(b), 'es') || a.localeCompare(b);

  // Main role of each person: the highest of the ladder; among equals, by área name.
  const main = new Map<string, { orgUnitId: string; unitName: string; id: string; rank: number; title: string | null }>();
  // Everyone with a ladder role on each área. An access role such as Aprobador is not a boss.
  const ladder = new Map<string, { personId: string; rank: number }[]>();
  for (const a of state.roleAssignments) {
    if (a.status !== 'active' || !people.has(a.personId)) continue;
    const role = roles.get(a.roleId);
    const rank = levelRank(role?.level ?? null);
    const candidate = { orgUnitId: a.orgUnitId, unitName: units.get(a.orgUnitId)?.name ?? '', id: a.id, rank, title: a.jobTitle ?? role?.name ?? null };
    const current = main.get(a.personId);
    if (!current || rank - current.rank < 0 || (rank === current.rank && (candidate.unitName.localeCompare(current.unitName, 'es') || candidate.id.localeCompare(current.id)) < 0)) main.set(a.personId, candidate);
    if (role?.level) ladder.set(a.orgUnitId, [...(ladder.get(a.orgUnitId) ?? []), { personId: a.personId, rank }]);
  }
  // Head of each área: the top of its ladder. Several people at that level share it; the first
  // by name stands for them and the rest are kept, so the screen can say it is not settled.
  const head = new Map<string, { personId: string; rank: number; peers: string[] }>();
  for (const [orgUnitId, holders] of ladder) {
    const top = Math.min(...holders.map((h) => h.rank));
    const [first, ...rest] = [...new Set(holders.filter((h) => h.rank === top).map((h) => h.personId))].sort(byName);
    head.set(orgUnitId, { personId: first!, rank: top, peers: rest });
  }

  // Lead of the first equipo, by name and then id, that each person belongs to.
  const teams = new Map(state.teams.filter((t) => t.status === 'active').map((t) => [t.id, t]));
  const leadOf = new Map<string, { personId: string; team: string; teamId: string }>();
  // Área of each person's first equipo, for people who hold no role.
  const teamUnit = new Map<string, { orgUnitId: string; team: string; teamId: string }>();
  for (const m of state.teamMemberships) {
    const team = m.status === 'active' ? teams.get(m.teamId) : undefined;
    if (!team) continue;
    const first = teamUnit.get(m.personId);
    if (!first || (team.name.localeCompare(first.team, 'es') || team.id.localeCompare(first.teamId)) < 0) teamUnit.set(m.personId, { orgUnitId: team.orgUnitId, team: team.name, teamId: team.id });
    const lead = team.leadPersonId;
    if (!lead || lead === m.personId || !people.has(lead)) continue;
    const current = leadOf.get(m.personId);
    if (!current || (team.name.localeCompare(current.team, 'es') || team.id.localeCompare(current.teamId)) < 0) leadOf.set(m.personId, { personId: lead, team: team.name, teamId: team.id });
  }

  const linkOf = (personId: string): Link | null => {
    if (!people.has(personId)) return null;
    const lead = leadOf.get(personId);
    if (lead) return { personId: lead.personId, peers: [] };
    const own = main.get(personId);
    // The set stops a loop in bad data; a tree of any depth is walked to its top.
    const seen = new Set<string>();
    for (let unit = units.get(own?.orgUnitId ?? ''); unit && !seen.has(unit.id); unit = unit.parentId ? units.get(unit.parentId) : undefined) {
      seen.add(unit.id);
      const leading = head.get(unit.id);
      // On their own área a boss is above them: someone at their level, co-heads included, is
      // a peer. Further up the tree the head may hold the same level, as a Director General
      // does over a director.
      const above = unit.id === own!.orgUnitId ? leading && leading.rank < own!.rank : leading && leading.rank <= own!.rank;
      if (leading && above && leading.personId !== personId) return { personId: leading.personId, peers: leading.peers.filter((peer) => peer !== personId) };
    }
    return null;
  };
  const bossOf = (personId: string) => linkOf(personId)?.personId ?? null;

  const ref = (personId: string, peers: string[] = []): PersonRef | null => {
    const person = people.get(personId) ?? state.people.find((p) => p.id === personId);
    if (!person) return null;
    const role = main.get(personId);
    return { id: person.id, displayName: person.displayName, title: role?.title ?? null, orgUnitId: role?.orgUnitId ?? teamUnit.get(personId)?.orgUnitId ?? null, sharedWith: peers.map(nameOf) };
  };

  return {
    bossOf,
    ref,
    chainOf(personId) {
      const chain: PersonRef[] = [];
      const seen = new Set([personId]);
      // The guard stops a loop, e.g. two people who each lead an equipo the other belongs to.
      for (let link = linkOf(personId); link && !seen.has(link.personId); link = linkOf(link.personId)) {
        seen.add(link.personId);
        chain.unshift(ref(link.personId, link.peers)!);
      }
      return chain;
    },
    reportsOf(personId) {
      const reports: PersonRef[] = [];
      for (const id of [...people.keys()].sort(byName)) {
        const link = linkOf(id);
        // Under co-heads the same person shows on each of them, naming the others.
        const heads = link ? [link.personId, ...link.peers] : [];
        if (heads.includes(personId)) reports.push(ref(id, heads.filter((head) => head !== personId))!);
      }
      return reports;
    },
  };
}
