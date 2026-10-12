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
  return (
    <Drawer open={target !== null} onClose={onClose} width={460} title={target ? `Historial de ${target.title}` : ''}>
      {history.isLoading ? (
        <Spin />
      ) : !entries.length ? (
        <Empty description="Sin cambios registrados" />
      ) : (
        <Timeline
          items={entries.map((entry, index) => {
            const now = entry.data as Record<string, unknown>;
            const before = entries[index + 1]?.data as Record<string, unknown> | undefined;
            const changed = Object.keys(FIELD).filter((field) => field in now && (!before || now[field] !== before[field]));
            return {
              children: (
                <>
                  <strong>{formatDateTime(entry.recordedAt)}</strong>
                  <div className="muted">
                    {entry.actorName === 'seed' ? 'Sistema' : entry.actorName} · {source(entry)}
                  </div>
                  {before ? (
                    changed.map((field) => (
                      <div key={field}>
                        {FIELD[field]}: {show(field, before[field])} → {show(field, now[field])}
                      </div>
                    ))
                  ) : (
                    <div>Se creó: {changed.filter((f) => now[f] !== null && now[f] !== '').map((f) => `${FIELD[f]} ${show(f, now[f])}`).join(' · ')}</div>
                  )}
                </>
              ),
            };
          })}
        />
      )}
    </Drawer>
  );
}
