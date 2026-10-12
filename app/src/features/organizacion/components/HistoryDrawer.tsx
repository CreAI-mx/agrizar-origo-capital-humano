import type { OrganizationView } from '@origo/capital-humano';
import { Drawer, Empty, Spin, Timeline } from 'antd';
import { useHistory } from '../hooks';
import { KIND_LABEL, formatDateTime } from '../lib';

const FIELD: Record<string, string> = {
  name: 'Nombre',
  displayName: 'Nombre',
  code: 'Código',
  kind: 'Tipo',
  parentId: 'Área superior',
  orgUnitId: 'Área',
  status: 'Estado',
  level: 'Nivel',
  description: 'Descripción',
  leadPersonId: 'Líder',
  account: 'Cuenta',
  employeeNumber: 'Número de empleado',
};
const STATUS: Record<string, string> = { active: 'Activo', inactive: 'Inactivo' };

interface Props {
  org: OrganizationView;
  target: { entityId: string; title: string } | null;
  onClose: () => void;
}

/** Spec M2-15: every version of a record, with what changed, who changed it and when. */
export function HistoryDrawer({ org, target, onClose }: Props) {
  const history = useHistory(target?.entityId);

  const show = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'parentId' || field === 'orgUnitId') return org.orgUnits.find((u) => u.id === value)?.name ?? String(value);
    if (field === 'leadPersonId') return org.people.find((p) => p.id === value)?.displayName ?? String(value);
    if (field === 'status') return STATUS[String(value)] ?? String(value);
    if (field === 'kind') return KIND_LABEL[value as keyof typeof KIND_LABEL] ?? String(value);
    return String(value);
  };
  const source = (entry: { source: string; actorName: string }) =>
    entry.actorName === 'seed' ? 'Carga inicial' : entry.source.startsWith('import:') ? 'Carga de archivo' : 'Back Office';

  const entries = history.data ?? [];
  const roleName = (id: unknown) => org.roles.find((r) => r.id === id)?.name ?? String(id);
  const unitName = (id: unknown) => org.orgUnits.find((u) => u.id === id)?.name ?? String(id);
  const personName = (id: unknown) => org.people.find((p) => p.id === id)?.displayName ?? String(id);
  const teamName = (id: unknown) => org.teams.find((t) => t.id === id)?.name ?? String(id);

  /** What one version says, compared with the previous version of the same record. */
  const describe = (entry: (typeof entries)[number], index: number): string[] => {
    const now = entry.data as Record<string, unknown>;
    const before = entries.slice(index + 1).find((older) => older.entityId === entry.entityId)?.data as Record<string, unknown> | undefined;
    if (entry.kind === 'roleAssignment') {
      const what = `${roleName(now.roleId)} en ${unitName(now.orgUnitId)}`;
      if (now.status !== 'active') return [`Rol revocado: ${what}`];
      if (!before || before.status !== 'active') return [`Rol asignado: ${what}${now.jobTitle ? ` · ${String(now.jobTitle)}` : ''}`];
      return [`Rol cambiado: ${roleName(before.roleId)} en ${unitName(before.orgUnitId)} → ${what}`, ...(before.jobTitle !== now.jobTitle ? [`Puesto: ${show('jobTitle', before.jobTitle)} → ${show('jobTitle', now.jobTitle)}`] : [])];
    }
    if (entry.kind === 'teamMembership') {
      // Seen from a person it names the equipo; seen from an equipo it names the person.
      const joined = now.status === 'active';
      if (now.personId === target?.entityId) return [`${joined ? 'Entró al' : 'Salió del'} equipo «${teamName(now.teamId)}»`];
      return [`${joined ? 'Entró' : 'Salió'}: ${personName(now.personId)}`];
    }
    const changed = Object.keys(FIELD).filter((field) => field in now && (!before || now[field] !== before[field]));
    if (before) return changed.map((field) => `${FIELD[field]}: ${show(field, before[field])} → ${show(field, now[field])}`);
    return [`Se creó: ${changed.filter((f) => now[f] !== null && now[f] !== '').map((f) => `${FIELD[f]} ${show(f, now[f])}`).join(' · ')}`];
  };
  return (
    <Drawer open={target !== null} onClose={onClose} width={460} title={target ? `Historial de ${target.title}` : ''}>
      {history.isLoading ? (
        <Spin />
      ) : !entries.length ? (
        <Empty description="Sin cambios registrados" />
      ) : (
        <Timeline
          items={entries.map((entry, index) => ({
            children: (
              <>
                <strong>{formatDateTime(entry.recordedAt)}</strong>
                <div className="muted">
                  {entry.actorName === 'seed' ? 'Sistema' : entry.actorName} · {source(entry)}
                </div>
                {describe(entry, index).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </>
            ),
          }))}
        />
      )}
    </Drawer>
  );
}
