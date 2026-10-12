import { z } from 'zod';

// Shapes follow contracts/organization.schema.json and docs/spec/data-model-organization.md.

export const ORG_UNIT_KINDS = ['empresa', 'direccion', 'area', 'subarea'] as const;
export const ROLE_LEVELS = [
  'director',
  'gerente',
  'jefe',
  'coordinador',
  'lider',
  'supervisor',
  'especialista',
  'analista',
  'auxiliar',
  'practicante',
] as const;

/** System role that may change the organization (spec M2-16, rule R-12). */
export const ADMIN_ROLE_CODE = 'administrador_origo';

const id = z.string().min(1);
const code = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'El código solo admite letras, números, guion y guion bajo');
const name = z.string().trim().min(1, 'El nombre es obligatorio');
const status = z.enum(['active', 'inactive']).default('active');

export const orgUnitSchema = z.object({
  id,
  code,
  name,
  kind: z.enum(ORG_UNIT_KINDS),
  parentId: id.nullable().default(null),
  sortOrder: z.number().int().default(0),
  status,
});

export const roleSchema = z.object({
  id,
  code,
  name,
  description: z.string().default(''),
  level: z.enum(ROLE_LEVELS).nullable().default(null),
  isSystem: z.boolean().default(false),
  status,
});

export const teamSchema = z.object({
  id,
  orgUnitId: id,
  code,
  name,
  leadPersonId: id.nullable().default(null),
  status,
});

export const personSchema = z.object({
  id,
  displayName: name,
  account: z.string().trim().email('La cuenta debe ser un correo').nullable().default(null),
  employeeNumber: z.string().trim().min(1).nullable().default(null),
  status,
});

export const roleAssignmentSchema = z.object({
  id,
  personId: id,
  roleId: id,
  orgUnitId: id,
  jobTitle: z.string().trim().min(1).nullable().default(null),
  status: z.enum(['active', 'revoked']).default('active'),
});

export const teamMembershipSchema = z.object({
  id,
  teamId: id,
  personId: id,
  status: z.enum(['active', 'removed']).default('active'),
});

export const entitySchemas = {
  orgUnit: orgUnitSchema,
  role: roleSchema,
  team: teamSchema,
  person: personSchema,
  roleAssignment: roleAssignmentSchema,
  teamMembership: teamMembershipSchema,
} as const;

export type EntityKind = keyof typeof entitySchemas;
export const ENTITY_KINDS = Object.keys(entitySchemas) as EntityKind[];

export type OrgUnit = z.infer<typeof orgUnitSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Person = z.infer<typeof personSchema>;
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;
export type TeamMembership = z.infer<typeof teamMembershipSchema>;

export interface EntityByKind {
  orgUnit: OrgUnit;
  role: Role;
  team: Team;
  person: Person;
  roleAssignment: RoleAssignment;
  teamMembership: TeamMembership;
}
export type AnyEntity = EntityByKind[EntityKind];

export interface OrganizationState {
  orgUnits: OrgUnit[];
  roles: Role[];
  teams: Team[];
  people: Person[];
  roleAssignments: RoleAssignment[];
  teamMemberships: TeamMembership[];
}

export const COLLECTION: { [K in EntityKind]: keyof OrganizationState } = {
  orgUnit: 'orgUnits',
  role: 'roles',
  team: 'teams',
  person: 'people',
  roleAssignment: 'roleAssignments',
  teamMembership: 'teamMemberships',
};

export const emptyState = (): OrganizationState => ({
  orgUnits: [],
  roles: [],
  teams: [],
  people: [],
  roleAssignments: [],
  teamMemberships: [],
});

/** One stored version of an entity. Rows are only ever appended (rule R-10). */
export interface VersionRow {
  rowId: string;
  kind: EntityKind | 'importRun';
  entityId: string;
  data: unknown;
  recordedAt: string;
  effectiveAt: string;
  actorId: string;
  /** `web`, `seed` or `import:<importRunId>`. */
  source: string;
  sourceRef: string | null;
  supersedesId: string | null;
  idempotencyKey: string;
}
