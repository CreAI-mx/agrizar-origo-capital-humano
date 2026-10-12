import { z } from 'zod';
import { DomainError } from './errors';
import {
  ORG_UNIT_KINDS,
  ROLE_LEVELS,
  entitySchemas,
  type AnyEntity,
  type EntityByKind,
  type EntityKind,
  type OrganizationState,
  type Team,
} from './models';
import { applyChange, checkTeamLeads, normalize } from './rules';

// Bulk load (spec M2-17 to M2-19). Rows are matched to existing records by business key,
// never by internal id: área and rol by code, equipo by área + code, persona by account
// or employee number. A load only creates and changes; it never deactivates what it omits.

const text = z.string().trim().min(1);
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null);

export const importPayloadSchema = z.object({
  orgUnits: z
    .array(z.object({ code: text, name: text, kind: z.enum(ORG_UNIT_KINDS), parentCode: optionalText }))
    .default([]),
  roles: z
    .array(
      z.object({
        code: text,
        name: text,
        level: z.enum(ROLE_LEVELS).nullish().transform((value) => value ?? null),
        description: optionalText,
        isSystem: z.boolean().default(false),
      }),
    )
    .default([]),
  teams: z.array(z.object({ code: text, name: text, orgUnitCode: text, leadKey: optionalText })).default([]),
  people: z
    .array(
      z.object({
        displayName: text,
        account: optionalText,
        employeeNumber: optionalText,
        assignments: z.array(z.object({ roleCode: text, orgUnitCode: text, jobTitle: optionalText })).default([]),
        teams: z.array(z.object({ orgUnitCode: text, teamCode: text })).default([]),
      }),
    )
    .default([]),
});
export type ImportPayload = z.infer<typeof importPayloadSchema>;

export type ImportSheet = 'areas' | 'roles' | 'equipos' | 'personas';
export type ImportAction = 'create' | 'change' | 'unchanged' | 'error';
export interface ImportItem {
  sheet: ImportSheet;
  row: number;
  key: string;
  action: ImportAction;
  message?: string;
}
export interface PlannedChange {
  kind: EntityKind;
  entity: AnyEntity;
  sourceRef: string;
}
export interface ImportPlan {
  changes: PlannedChange[];
  items: ImportItem[];
  summary: Record<ImportAction, number>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function planImport(current: OrganizationState, payload: ImportPayload, newId: () => string): ImportPlan {
  let state = current;
  const changes: PlannedChange[] = [];
  const items: ImportItem[] = [];

  /** Creates or replaces one record, or reports why the row cannot be loaded. */
  function upsert<K extends EntityKind>(
    sheet: ImportSheet,
    row: number,
    key: string,
    kind: K,
    existing: EntityByKind[K] | undefined,
    fields: Record<string, unknown>,
  ): EntityByKind[K] | undefined {
    try {
      const entity = entitySchemas[kind].parse({ ...(existing ?? { id: newId() }), ...fields }) as EntityByKind[K];
      if (existing && same(existing, entity)) {
        items.push({ sheet, row, key, action: 'unchanged' });
        return existing;
      }
      state = applyChange(state, kind, entity);
      changes.push({ kind, entity, sourceRef: `${sheet}:${row}` });
      items.push({ sheet, row, key, action: existing ? 'change' : 'create' });
      return entity;
    } catch (error) {
      const message =
        error instanceof DomainError
          ? [error.message, ...error.details].join(' ')
          : error instanceof z.ZodError
            ? error.issues.map((issue) => issue.message).join('; ')
            : String(error);
      items.push({ sheet, row, key, action: 'error', message });
      return undefined;
    }
  }
  const reject = (sheet: ImportSheet, row: number, key: string, message: string) =>
    items.push({ sheet, row, key, action: 'error', message });
  const unitByCode = (code: string) => state.orgUnits.find((u) => normalize(u.code) === normalize(code));

  payload.roles.forEach((row, index) => {
    const existing = state.roles.find((r) => normalize(r.code) === normalize(row.code));
    upsert('roles', index + 1, row.code, 'role', existing, {
      code: row.code,
      name: row.name,
      level: row.level,
      description: row.description ?? '',
      isSystem: existing?.isSystem ?? row.isSystem,
      status: 'active',
    });
  });

  // Áreas may come in any order: load every row whose parent is already known, and repeat.
  const seenCodes = new Set<string>();
  let pending = payload.orgUnits.map((row, index) => ({ row, line: index + 1 }));
  pending = pending.filter(({ row, line }) => {
    const code = normalize(row.code);
    if (seenCodes.has(code)) {
      reject('areas', line, row.code, `El código ${row.code} está repetido en el archivo.`);
      return false;
    }
    seenCodes.add(code);
    return true;
  });
  for (let progressed = true; progressed && pending.length; ) {
    progressed = false;
    const waiting: typeof pending = [];
    for (const entry of pending) {
      const { row, line } = entry;
      const parent = row.parentCode ? unitByCode(row.parentCode) : undefined;
      const parentComesLater = row.parentCode && !parent && pending.some((p) => normalize(p.row.code) === normalize(row.parentCode!));
      if (parentComesLater) {
        waiting.push(entry);
        continue;
      }
      progressed = true;
      if (row.parentCode && !parent) {
        reject('areas', line, row.code, `No existe el área superior ${row.parentCode}.`);
        continue;
      }
      upsert('areas', line, row.code, 'orgUnit', unitByCode(row.code), {
        code: row.code,
        name: row.name,
        kind: row.kind,
        parentId: parent?.id ?? null,
        status: 'active',
      });
    }
    if (!progressed) {
      for (const { row, line } of waiting) reject('areas', line, row.code, `Su área superior ${row.parentCode} no se pudo cargar.`);
    }
    pending = waiting;
  }

  const teamKeys = new Map<string, { team: Team; line: number; leadKey: string | null }>();
  payload.teams.forEach((row, index) => {
    const unit = unitByCode(row.orgUnitCode);
    const key = `${row.orgUnitCode}/${row.code}`;
    if (!unit) return reject('equipos', index + 1, key, `No existe el área ${row.orgUnitCode}.`);
    const existing = state.teams.find((t) => t.orgUnitId === unit.id && normalize(t.code) === normalize(row.code));
    const team = upsert('equipos', index + 1, key, 'team', existing, {
      orgUnitId: unit.id,
      code: row.code,
      name: row.name,
      status: 'active',
    });
    if (team) teamKeys.set(normalize(key), { team, line: index + 1, leadKey: row.leadKey });
  });

  const personIdByKey = new Map<string, string>();
  payload.people.forEach((row, index) => {
    const line = index + 1;
    const key = row.account ?? row.employeeNumber;
    if (!key) return reject('personas', line, row.displayName, 'Falta la cuenta o el número de empleado.');
    const existing = state.people.find(
      (p) =>
        (row.account && p.account && normalize(p.account) === normalize(row.account)) ||
        (row.employeeNumber && p.employeeNumber === row.employeeNumber),
    );
    const person = upsert('personas', line, key, 'person', existing, {
      displayName: row.displayName,
      account: row.account ?? existing?.account ?? null,
      employeeNumber: row.employeeNumber ?? existing?.employeeNumber ?? null,
      status: 'active',
    });
    if (!person) return;
    personIdByKey.set(normalize(key), person.id);

    for (const item of row.assignments) {
      const label = `${key} · ${item.roleCode} en ${item.orgUnitCode}`;
      const role = state.roles.find((r) => normalize(r.code) === normalize(item.roleCode));
      const unit = unitByCode(item.orgUnitCode);
      if (!role) reject('personas', line, label, `No existe el rol ${item.roleCode}.`);
      else if (!unit) reject('personas', line, label, `No existe el área ${item.orgUnitCode}.`);
      else {
        const held = state.roleAssignments.find(
          (a) => a.status === 'active' && a.personId === person.id && a.roleId === role.id && a.orgUnitId === unit.id,
        );
        upsert('personas', line, label, 'roleAssignment', held, {
          personId: person.id,
          roleId: role.id,
          orgUnitId: unit.id,
          jobTitle: item.jobTitle,
          status: 'active',
        });
      }
    }
    for (const item of row.teams) {
      const label = `${key} · equipo ${item.orgUnitCode}/${item.teamCode}`;
      const unit = unitByCode(item.orgUnitCode);
      const team = unit && state.teams.find((t) => t.orgUnitId === unit.id && normalize(t.code) === normalize(item.teamCode));
      if (!team) reject('personas', line, label, `No existe el equipo ${item.orgUnitCode}/${item.teamCode}.`);
      else {
        const joined = state.teamMemberships.find((m) => m.status === 'active' && m.teamId === team.id && m.personId === person.id);
        upsert('personas', line, label, 'teamMembership', joined, { teamId: team.id, personId: person.id, status: 'active' });
      }
    }
  });

  // Leads are set last: a lead has to be a member, and members are loaded with the people.
  for (const [key, { team, line, leadKey }] of teamKeys) {
    if (!leadKey) continue;
    const leadPersonId =
      personIdByKey.get(normalize(leadKey)) ??
      state.people.find((p) => (p.account && normalize(p.account) === normalize(leadKey)) || p.employeeNumber === leadKey)?.id;
    const current = state.teams.find((t) => t.id === team.id)!;
    if (!leadPersonId) reject('equipos', line, key, `No existe la persona líder ${leadKey}.`);
    else if (current.leadPersonId !== leadPersonId) {
      const pendingChange = changes.find((c) => c.kind === 'team' && c.entity.id === team.id);
      const withLead = { ...current, leadPersonId };
      try {
        state = applyChange(state, 'team', withLead);
        if (pendingChange) pendingChange.entity = withLead;
        else {
          changes.push({ kind: 'team', entity: withLead, sourceRef: `equipos:${line}` });
          const item = items.find((i) => i.sheet === 'equipos' && i.row === line);
          if (item) item.action = 'change';
        }
      } catch (error) {
        reject('equipos', line, key, error instanceof Error ? error.message : String(error));
      }
    }
  }
  try {
    checkTeamLeads(state);
  } catch (error) {
    // Drop the lead rather than load a team that breaks R-08.
    for (const change of changes) {
      if (change.kind !== 'team') continue;
      const team = change.entity as Team;
      const isMember = state.teamMemberships.some((m) => m.status === 'active' && m.teamId === team.id && m.personId === team.leadPersonId);
      if (team.leadPersonId && !isMember) {
        change.entity = { ...team, leadPersonId: null };
        reject('equipos', Number(change.sourceRef.split(':')[1]), team.code, error instanceof Error ? error.message : String(error));
      }
    }
  }

  const summary: Record<ImportAction, number> = { create: 0, change: 0, unchanged: 0, error: 0 };
  for (const item of items) summary[item.action] += 1;
  return { changes, items, summary };
}
