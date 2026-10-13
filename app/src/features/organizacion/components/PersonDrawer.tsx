import type { OrganizationView, PersonRef, PersonRow } from '@origo/capital-humano';
import { ROLE_LEVELS } from '@origo/capital-humano';
import { Alert, Button, Drawer, Popconfirm, Space, Spin, Tag, Tooltip } from 'antd';
import { useMemo } from 'react';
import { CropDot, cropsOf } from '../crops';
import { usePerson, useSameSnapshot } from '../hooks';
import { count, formatDateTime } from '../lib';
import { READ_ONLY_HINT } from '../types';
import { PersonAvatar } from './PersonAvatar';

export const ALERT_LABEL: Record<PersonRow['alerts'][number], string> = { noTeam: 'Sin equipo', noAccount: 'Sin cuenta', noRole: 'Sin rol' };
const ALERT_HELP: Record<PersonRow['alerts'][number], string> = {
  noTeam: 'No pertenece a ningún equipo.',
  noAccount: 'No tiene cuenta corporativa registrada.',
  noRole: 'No tiene rol en ningún área, así que no aparece en el organigrama.',
};
const SHOWN_REPORTS = 8;

/** "6 · Supervisor" for ladder roles; the bare name for the rest. */
export const levelLabel = (assignment: PersonRow['assignments'][number]) =>
  assignment.level ? `${ROLE_LEVELS.indexOf(assignment.level) + 1} · ${assignment.roleName}` : assignment.roleName;
export const titleOf = (person: PersonRow) => person.assignments[0]?.jobTitle ?? person.assignments[0]?.roleName ?? null;
/** "Producción › Invernaderos Norte": the path without the empresa, which everyone shares. */
export const areaPath = (path: string[]) => (path.length > 1 ? path.slice(1) : path).join(' › ');

interface Props {
  personId: string | null;
  org: OrganizationView;
  canEdit: boolean;
  busy: boolean;
  onClose: () => void;
  onOpen: (personId: string) => void;
  onEdit: (person: PersonRow) => void;
  onDeactivate: (person: PersonRow) => void;
  onReactivate: (person: PersonRow) => void;
  onHistory: (entityId: string, title: string) => void;
  onShowArea: (orgUnitId: string) => void;
}

/** Spec M2-27: one person with their line of command, roles, equipos and what they can see. */
export function PersonDrawer({ personId, org, canEdit, busy, onClose, onOpen, onEdit, onDeactivate, onReactivate, onHistory, onShowArea }: Props) {
  const profile = usePerson(personId);
  const crops = useMemo(() => cropsOf(org.orgUnits), [org.orgUnits]);
  const data = profile.data?.person.id === personId ? profile.data : undefined;
  useSameSnapshot(org.dataAsOf, data?.dataAsOf, 'person');
  const person = data?.person;
  const main = person?.assignments[0];
  // Someone with no role still belongs to the área of their equipo.
  const areaId = main?.orgUnitId ?? person?.teams[0]?.orgUnitId;

  // `unsettled` is what to say when the organization does not settle that link.
  const link = (ref: PersonRef, unsettled: (others: string) => string) => (
    <button key={ref.id} type="button" className="chain-row" onClick={() => onOpen(ref.id)}>
      <PersonAvatar name={ref.displayName} crop={ref.orgUnitId ? crops.get(ref.orgUnitId) : undefined} size={28} />
      <span>
        {ref.displayName} {ref.title && <span className="muted">· {ref.title}</span>}
        {ref.sharedWith.length > 0 && <span className="chain-shared">{unsettled(ref.sharedWith.join(', '))}</span>}
      </span>
    </button>
  );
  const inChain = (ref: PersonRef) => link(ref, (others) => `O ${others}: la organización no define a quién de ellos reporta.`);
  const asReport = (ref: PersonRef) => link(ref, (others) => `También puede reportar a ${others}: la organización no lo define.`);

  return (
    <Drawer open={personId !== null} onClose={onClose} title="Ficha de persona" width="min(580px, 100vw)" destroyOnHidden>
      {profile.isError ? (
        <Alert type="error" showIcon message="No se pudo cargar la ficha" description={profile.error instanceof Error ? profile.error.message : undefined} />
      ) : !person || !data ? (
        <Spin />
      ) : (
        <div className="ficha">
          <div className="ficha-head">
            <PersonAvatar name={person.displayName} crop={areaId ? crops.get(areaId) : undefined} size={64} />
            <div>
              <h2>{person.displayName}</h2>
              <div className="ficha-title">{titleOf(person) ?? 'Sin puesto'}</div>
              <Space size={[4, 4]} wrap>
                {person.employeeNumber && <Tag className="mono">{person.employeeNumber}</Tag>}
                {person.account && <Tag className="mono">{person.account}</Tag>}
                <Tag color={person.status === 'active' ? 'success' : undefined}>{person.status === 'active' ? 'Activa' : 'Inactiva'}</Tag>
                {main?.level && <Tag>Nivel {levelLabel(main)}</Tag>}
                {person.teams.some((team) => team.isLead) && <Tag color="processing">Líder de equipo</Tag>}
              </Space>
            </div>
          </div>

          <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
            <Space wrap>
              {person.status === 'active' ? (
                <>
                  <Button type="primary" disabled={!canEdit} onClick={() => onEdit(person)}>
                    Editar
                  </Button>
                  {areaId && <Button onClick={() => onShowArea(areaId)}>Ver en el organigrama</Button>}
                  <Popconfirm title={`¿Desactivar a «${person.displayName}»?`} description="Se revocan sus roles, sale de sus equipos y los que lidera quedan sin líder." okText="Desactivar" cancelText="Cancelar" onConfirm={() => onDeactivate(person)} disabled={!canEdit}>
                    <Button danger disabled={!canEdit} loading={busy}>
                      Desactivar
                    </Button>
                  </Popconfirm>
                </>
              ) : (
                <Button type="primary" disabled={!canEdit} loading={busy} onClick={() => onReactivate(person)}>
                  Reactivar
                </Button>
              )}
              <Button type="link" onClick={() => onHistory(person.id, person.displayName)}>
                Historial
              </Button>
            </Space>
          </Tooltip>

          {person.alerts.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={count(person.alerts.length, 'dato por completar', 'datos por completar')}
              description={
                <ul className="ficha-list">
                  {person.alerts.map((alert) => (
                    <li key={alert}>{ALERT_HELP[alert]}</li>
                  ))}
                </ul>
              }
            />
          )}

          <section className="ficha-section">
            <span className="eyebrow">Línea de mando</span>
            {data.chain.length === 0 && data.reports.length === 0 ? (
              <p className="muted">No se puede deducir: nadie encabeza su área ni lidera su equipo, y nadie depende de esta persona.</p>
            ) : (
              <div className="chain">
                {data.chain.map(inChain)}
                <div className="chain-row is-current">
                  <PersonAvatar name={person.displayName} crop={areaId ? crops.get(areaId) : undefined} size={28} />
                  <span>
                    <strong>{person.displayName}</strong> {titleOf(person) && <span className="muted">· {titleOf(person)}</span>}
                  </span>
                </div>
                {data.reports.length > 0 && (
                  <div className="chain-reports">
                    <span className="muted">Le {data.reports.length === 1 ? 'reporta' : 'reportan'} {count(data.reports.length, 'persona', 'personas')}</span>
                    {data.reports.slice(0, SHOWN_REPORTS).map(asReport)}
                    {data.reports.length > SHOWN_REPORTS && <span className="muted">y {data.reports.length - SHOWN_REPORTS} más</span>}
                  </div>
                )}
              </div>
            )}
            <p className="ficha-note">Se deduce de quién lidera su equipo y de quién encabeza cada área. No se captura por persona.</p>
          </section>

          <section className="ficha-section">
            <span className="eyebrow">Rol y área</span>
            {person.assignments.length ? (
              <ul className="ficha-list">
                {person.assignments.map((a) => (
                  <li key={a.id}>
                    <strong>{a.roleName}</strong> en {a.orgUnitName}
                    {a.jobTitle && <span className="muted"> · {a.jobTitle}</span>}
                    <div className="muted">
                      <CropDot crop={crops.get(a.orgUnitId)} />
                      {a.orgUnitPath.join(' › ')}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Sin rol en ningún área.</p>
            )}
          </section>

          <section className="ficha-section">
            <span className="eyebrow">Equipos</span>
            {person.teams.length ? (
              <ul className="ficha-list">
                {person.teams.map((team) => (
                  <li key={team.id}>
                    <strong>{team.name}</strong> {team.isLead && <Tag color="processing">Líder</Tag>}
                    <div className="muted">
                      {count(team.members, 'integrante', 'integrantes')} · {team.orgUnitName}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No pertenece a ningún equipo.</p>
            )}
          </section>

          <section className="ficha-section">
            <span className="eyebrow">Qué puede ver</span>
            {data.access.orgUnitIds.length ? (
              <>
                <p>
                  <strong>{count(data.access.orgUnitIds.length, 'área', 'áreas')}</strong>, por {data.access.roles.length === 1 ? 'su rol' : 'sus roles'} en {[...new Set(data.access.roles.map((r) => r.orgUnitName))].join(', ')}.
                </p>
                <p className="muted">{data.access.isAdmin ? 'Es Administrador de Origo: puede cambiar la organización.' : 'No es Administrador de Origo: solo consulta.'}</p>
              </>
            ) : (
              <p className="muted">Ninguna área: no tiene un rol activo.</p>
            )}
          </section>
          {data.dataAsOf && <p className="fresh">Dato de: {formatDateTime(data.dataAsOf)}</p>}
        </div>
      )}
    </Drawer>
  );
}
