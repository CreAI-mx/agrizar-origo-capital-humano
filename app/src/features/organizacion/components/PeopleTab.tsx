import type { PeopleTray, PersonRow } from '@origo/capital-humano';
import { Alert, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, Tooltip, TreeSelect } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { Change } from '../api';
import { CropDot, cropsOf } from '../crops';
import { usePeople, useSameSnapshot, useSave } from '../hooks';
import { formatDateTime, unitTree } from '../lib';
import { READ_ONLY_HINT, type TabProps } from '../types';
import { PersonAvatar } from './PersonAvatar';
import { ALERT_LABEL, PersonDrawer, areaPath, levelLabel, titleOf } from './PersonDrawer';

interface AssignmentDraft {
  id?: string;
  roleId: string;
  orgUnitId: string;
  jobTitle?: string | null;
}
interface Draft {
  id?: string;
  displayName?: string;
  account?: string | null;
  employeeNumber?: string | null;
  assignments: AssignmentDraft[];
}

// Each tray is a list of people with something to complete (spec M2-26).
const TRAYS: { key: PeopleTray; label: string; hint: string }[] = [
  { key: 'noTeam', label: 'Sin equipo', hint: 'No pertenecen a ningún equipo' },
  { key: 'noAccount', label: 'Sin cuenta', hint: 'Les falta la cuenta corporativa' },
  { key: 'noRole', label: 'Sin rol', hint: 'No aparecen en ningún área' },
  { key: 'inactive', label: 'Inactivas', hint: 'Conservan su historial' },
];
const PAGE_SIZES = [25, 50, 100];

/** Spec M2-26: the directory asks the API for one page at a time, already searched and filtered. */
export function PeopleTab({ org, canEdit, onHistory, scope, scopeId, onShowArea, focusRoleId }: TabProps) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [tray, setTray] = useState<PeopleTray | null>(null);
  const [roleId, setRoleId] = useState<string | null>(focusRoleId);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]!);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form] = Form.useForm<Draft>();
  const save = useSave();

  // The search waits for a pause in typing, so each keystroke is not a request.
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  // Another área: back to the first page, and an equipo outside it no longer applies.
  useEffect(() => {
    setPage(1);
    setTeamId(null);
  }, [scopeId]);
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  const people = usePeople({ search: term, tray, roleId, teamId, orgUnitId: scopeId, includeInactive: showInactive, page, pageSize });
  const counts = people.data?.counts;
  useSameSnapshot(org.dataAsOf, people.isPlaceholderData ? undefined : people.data?.dataAsOf, 'people');
  const crops = useMemo(() => cropsOf(org.orgUnits), [org.orgUnits]);
  const unitOptions = useMemo(() => unitTree(org.orgUnits.filter((u) => u.status === 'active')), [org.orgUnits]);
  const roleOptions = useMemo(() => org.roles.filter((r) => r.status === 'active').map((r) => ({ value: r.id, label: r.name })), [org.roles]);
  const teamOptions = useMemo(
    () => org.teams.filter((t) => t.status === 'active' && (!scope || scope.has(t.orgUnitId))).map((t) => ({ value: t.id, label: t.name })).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [org.teams, scope],
  );
  const filtered = Boolean(term || tray || roleId || teamId);

  const open = (person?: PersonRow) => {
    const value: Draft = person
      ? { id: person.id, displayName: person.displayName, account: person.account, employeeNumber: person.employeeNumber, assignments: person.assignments.map(({ id, roleId, orgUnitId, jobTitle }) => ({ id, roleId, orgUnitId, jobTitle })) }
      : { assignments: [] };
    setEditing(person ?? null);
    setDraft(value);
    form.resetFields();
    form.setFieldsValue(value);
  };
  const submit = (values: Draft) => {
    const id = draft?.id ?? crypto.randomUUID();
    const current = editing?.assignments ?? [];
    const kept = values.assignments ?? [];
    // Revocations go first, so removing a role and adding it again in one edit is not a duplicate.
    const changes: Change[] = [
      { kind: 'person', data: { id, displayName: values.displayName, account: values.account || null, employeeNumber: values.employeeNumber || null, status: 'active' } },
      ...current.filter((a) => !kept.some((k) => k.id === a.id)).map((a): Change => ({ kind: 'roleAssignment', data: { id: a.id, personId: id, roleId: a.roleId, orgUnitId: a.orgUnitId, jobTitle: a.jobTitle, status: 'revoked' } })),
      ...kept
        .filter((k) => {
          const before = current.find((a) => a.id === k.id);
          return !before || before.roleId !== k.roleId || before.orgUnitId !== k.orgUnitId || (before.jobTitle ?? '') !== (k.jobTitle ?? '');
        })
        .map((k): Change => ({ kind: 'roleAssignment', data: { ...(k.id ? { id: k.id } : {}), personId: id, roleId: k.roleId, orgUnitId: k.orgUnitId, jobTitle: k.jobTitle || null, status: 'active' } })),
    ];
    save.mutate({ changes, done: 'Persona guardada' }, { onSuccess: () => setDraft(null) });
  };
  const entity = (person: PersonRow, status: 'active' | 'inactive') => ({ id: person.id, displayName: person.displayName, account: person.account, employeeNumber: person.employeeNumber, status });
  // Equipos they lead are left without a lead first: a lead has to be a member (R-08).
  const deactivate = (person: PersonRow) =>
    save.mutate({
      changes: [
        ...person.teams.filter((t) => t.isLead).flatMap((t): Change[] => {
          const team = org.teams.find((candidate) => candidate.id === t.id);
          return team ? [{ kind: 'team', data: { ...team, leadPersonId: null } }] : [];
        }),
        ...person.assignments.map((a): Change => ({ kind: 'roleAssignment', data: { id: a.id, personId: person.id, roleId: a.roleId, orgUnitId: a.orgUnitId, jobTitle: a.jobTitle, status: 'revoked' } })),
        ...person.teams.map((t): Change => ({ kind: 'teamMembership', data: { id: t.membershipId, teamId: t.id, personId: person.id, status: 'removed' } })),
        { kind: 'person', data: entity(person, 'inactive') },
      ],
      done: 'Persona desactivada',
    });
  const reactivate = (person: PersonRow) => save.mutate({ changes: [{ kind: 'person', data: entity(person, 'active') }], done: 'Persona reactivada' });

  return (
    <>
      <div className="trays">
        {TRAYS.map(({ key, label, hint }) => {
          const size = counts?.[key];
          return (
            <button key={key} type="button" className={`tray ${key === 'inactive' ? 'is-neutral' : size ? 'has-some' : ''}`} aria-pressed={tray === key} onClick={() => filter(setTray)(tray === key ? null : key)}>
              <span className="tray-count">{size ?? '–'}</span>
              <span className="tray-label">{label}</span>
              <span className="tray-hint">{hint}</span>
            </button>
          );
        })}
      </div>
      <div className="toolbar">
        <Input.Search className="grow" allowClear placeholder="Buscar por nombre, puesto, cuenta o número de empleado" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select className="filter" allowClear showSearch optionFilterProp="label" placeholder="Rol" aria-label="Filtrar por rol" value={roleId} onChange={(value) => filter(setRoleId)(value ?? null)} options={roleOptions} />
        <Select className="filter" allowClear showSearch optionFilterProp="label" placeholder="Equipo" aria-label="Filtrar por equipo" value={teamId} onChange={(value) => filter(setTeamId)(value ?? null)} options={teamOptions} />
        <Space>
          <Switch size="small" checked={showInactive || tray === 'inactive'} disabled={tray === 'inactive'} onChange={filter(setShowInactive)} id="show-inactive-people" />
          <label htmlFor="show-inactive-people">Ver inactivas</label>
        </Space>
        <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
          <Button type="primary" disabled={!canEdit} onClick={() => open()}>
            Nueva persona
          </Button>
        </Tooltip>
      </div>
      {people.isError && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="No se pudo cargar el directorio" description={people.error instanceof Error ? people.error.message : undefined} />}
      {people.data?.dataAsOf && <p className="fresh directory-fresh">Dato de: {formatDateTime(people.data.dataAsOf)}</p>}
      <Table<PersonRow>
        size="small"
        rowKey="id"
        loading={people.isFetching}
        dataSource={people.data?.items ?? []}
        scroll={{ x: 980 }}
        pagination={{
          current: people.data?.page ?? page,
          pageSize,
          total: people.data?.total ?? 0,
          pageSizeOptions: PAGE_SIZES,
          showSizeChanger: true,
          showTotal: (total) => (counts && (filtered || scope) ? `${total} de ${counts.active + (showInactive || tray === 'inactive' ? counts.inactive : 0)} personas` : `${total} personas`),
          onChange: (nextPage, nextSize) => {
            setPage(nextSize === pageSize ? nextPage : 1);
            setPageSize(nextSize);
          },
        }}
        locale={{ emptyText: filtered ? 'Nadie coincide con lo que buscas' : scope ? 'Nadie tiene rol ni equipo en esta área' : 'Aún no hay personas' }}
        columns={[
          {
            title: 'Persona',
            render: (_, p) => (
              <button type="button" className="person-link" onClick={() => setProfileId(p.id)} aria-label={`Abrir la ficha de ${p.displayName}`}>
                <PersonAvatar name={p.displayName} crop={crops.get(p.assignments[0]?.orgUnitId ?? p.teams[0]?.orgUnitId ?? '')} />
                <span>
                  <span className="person-name">{p.displayName}</span>
                  <span className="person-id">{p.employeeNumber ?? p.account ?? 'Sin identificador'}</span>
                </span>
              </button>
            ),
          },
          {
            title: 'Puesto',
            render: (_, p) => (
              <>
                {titleOf(p) ?? <span className="muted">Sin puesto</span>}
                {p.assignments.length > 1 && <span className="muted"> · +{p.assignments.length - 1}</span>}
              </>
            ),
          },
          {
            title: 'Área',
            render: (_, p) => {
              // Someone with no role still belongs to the área of their equipo.
              const place = p.assignments[0] ?? p.teams[0];
              return place ? (
                <>
                  <CropDot crop={crops.get(place.orgUnitId)} />
                  {areaPath(place.orgUnitPath)}
                </>
              ) : (
                <span className="muted">—</span>
              );
            },
          },
          { title: 'Nivel', render: (_, p) => (p.assignments[0] ? p.assignments[0].level ? <Tag>{levelLabel(p.assignments[0])}</Tag> : <span className="muted">Sin nivel</span> : <span className="muted">—</span>) },
          {
            title: 'Equipo',
            render: (_, p) =>
              p.teams[0] ? (
                <>
                  {p.teams[0].name} {p.teams[0].isLead && <Tag color="processing">Líder</Tag>}
                  {p.teams.length > 1 && <span className="muted">+{p.teams.length - 1}</span>}
                </>
              ) : (
                <span className="muted">—</span>
              ),
          },
          {
            title: 'Por completar',
            render: (_, p) =>
              p.status === 'inactive' ? (
                <Tag>Inactiva</Tag>
              ) : (
                <Space size={[4, 4]} wrap>
                  {p.alerts.map((alert) => (
                    <Tag key={alert} color="warning">
                      {ALERT_LABEL[alert]}
                    </Tag>
                  ))}
                </Space>
              ),
          },
          {
            title: '',
            align: 'right',
            render: (_, p) =>
              p.status === 'active' ? (
                <Button size="small" disabled={!canEdit} onClick={() => open(p)}>
                  Editar
                </Button>
              ) : (
                <Button size="small" disabled={!canEdit} onClick={() => reactivate(p)}>
                  Reactivar
                </Button>
              ),
          },
        ]}
      />
      <PersonDrawer
        personId={profileId}
        org={org}
        canEdit={canEdit}
        busy={save.isPending}
        onClose={() => setProfileId(null)}
        onOpen={setProfileId}
        onEdit={open}
        onDeactivate={deactivate}
        onReactivate={reactivate}
        onHistory={onHistory}
        onShowArea={onShowArea}
      />
      <Modal width={760} open={draft !== null} title={draft?.id ? 'Editar persona' : 'Nueva persona'} okText="Guardar" cancelText="Cancelar" confirmLoading={save.isPending} onCancel={() => setDraft(null)} onOk={() => form.submit()} forceRender>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="displayName" label="Nombre" rules={[{ required: true, message: 'Escribe el nombre' }]}>
            <Input />
          </Form.Item>
          <Space size="middle" align="start" wrap>
            <Form.Item name="account" label="Cuenta corporativa" rules={[{ type: 'email', message: 'Debe ser un correo' }]}>
              <Input style={{ width: 300 }} placeholder="nombre@agrizar.com" />
            </Form.Item>
            <Form.Item name="employeeNumber" label="Número de empleado">
              <Input style={{ width: 200 }} />
            </Form.Item>
          </Space>
          <strong>Roles por área</strong>
          <p className="muted" style={{ marginTop: 4 }}>
            Un rol en un área cubre esa área y todas las que tiene debajo.
          </p>
          <Form.List name="assignments">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="start" wrap style={{ display: 'flex' }}>
                    <Form.Item name={[field.name, 'roleId']} rules={[{ required: true, message: 'Elige el rol' }]}>
                      <Select style={{ width: 180 }} placeholder="Rol" optionFilterProp="label" showSearch options={org.roles.filter((r) => r.status === 'active').map((r) => ({ value: r.id, label: r.name }))} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'orgUnitId']} rules={[{ required: true, message: 'Elige el área' }]}>
                      <TreeSelect style={{ width: 230 }} placeholder="Área" showSearch treeNodeFilterProp="title" treeData={unitOptions} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'jobTitle']}>
                      <Input style={{ width: 200 }} placeholder="Puesto (opcional)" />
                    </Form.Item>
                    <Button onClick={() => remove(field.name)}>Quitar</Button>
                  </Space>
                ))}
                <Button onClick={() => add({})}>Agregar rol</Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
}
