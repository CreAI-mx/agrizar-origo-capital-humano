import type { Person } from '@origo/capital-humano';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Tooltip, TreeSelect } from 'antd';
import { useMemo, useState } from 'react';
import type { Change } from '../api';
import { useSave } from '../hooks';
import { normalize, unitTree } from '../lib';
import { READ_ONLY_HINT, type TabProps } from '../types';

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

export function PeopleTab({ org, canEdit, onHistory }: TabProps) {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form] = Form.useForm<Draft>();
  const save = useSave();

  const assignmentsOf = (personId: string) => org.roleAssignments.filter((a) => a.personId === personId && a.status === 'active');
  const membershipsOf = (personId: string) => org.teamMemberships.filter((m) => m.personId === personId && m.status === 'active');
  const roleName = (id: string) => org.roles.find((r) => r.id === id)?.name ?? '';
  const unitName = (id: string) => org.orgUnits.find((u) => u.id === id)?.name ?? '';
  const unitOptions = useMemo(() => unitTree(org.orgUnits.filter((u) => u.status === 'active')), [org.orgUnits]);

  const query = normalize(search);
  const people = org.people
    .filter((p) => showInactive || p.status === 'active')
    .filter((p) => !query || normalize(`${p.displayName} ${p.account ?? ''} ${p.employeeNumber ?? ''}`).includes(query))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

  const open = (person?: Person) => {
    const value: Draft = person ? { ...person, assignments: assignmentsOf(person.id).map(({ id, roleId, orgUnitId, jobTitle }) => ({ id, roleId, orgUnitId, jobTitle })) } : { assignments: [] };
    setDraft(value);
    form.resetFields();
    form.setFieldsValue(value);
  };
  const submit = (values: Draft) => {
    const id = draft?.id ?? crypto.randomUUID();
    const current = draft?.id ? assignmentsOf(draft.id) : [];
    const kept = values.assignments ?? [];
    // Revocations go first, so removing a role and adding it again in one edit is not a duplicate.
    const changes: Change[] = [
      { kind: 'person', data: { id, displayName: values.displayName, account: values.account || null, employeeNumber: values.employeeNumber || null, status: 'active' } },
      ...current.filter((a) => !kept.some((k) => k.id === a.id)).map((a): Change => ({ kind: 'roleAssignment', data: { ...a, status: 'revoked' } })),
      ...kept
        .filter((k) => {
          const before = current.find((a) => a.id === k.id);
          return !before || before.roleId !== k.roleId || before.orgUnitId !== k.orgUnitId || (before.jobTitle ?? '') !== (k.jobTitle ?? '');
        })
        .map((k): Change => ({ kind: 'roleAssignment', data: { ...(k.id ? { id: k.id } : {}), personId: id, roleId: k.roleId, orgUnitId: k.orgUnitId, jobTitle: k.jobTitle || null, status: 'active' } })),
    ];
    save.mutate({ changes, done: 'Persona guardada' }, { onSuccess: () => setDraft(null) });
  };
  // Equipos they lead are left without a lead first: a lead has to be a member (R-08).
  const deactivate = (person: Person) =>
    save.mutate({
      changes: [
        ...org.teams.filter((t) => t.status === 'active' && t.leadPersonId === person.id).map((t): Change => ({ kind: 'team', data: { ...t, leadPersonId: null } })),
        ...assignmentsOf(person.id).map((a): Change => ({ kind: 'roleAssignment', data: { ...a, status: 'revoked' } })),
        ...membershipsOf(person.id).map((m): Change => ({ kind: 'teamMembership', data: { ...m, status: 'removed' } })),
        { kind: 'person', data: { ...person, status: 'inactive' } },
      ],
      done: 'Persona desactivada',
    });
  const reactivate = (person: Person) => save.mutate({ changes: [{ kind: 'person', data: { ...person, status: 'active' } }], done: 'Persona reactivada' });

  return (
    <>
      <div className="toolbar">
        <Input.Search className="grow" allowClear placeholder="Buscar por nombre, cuenta o número de empleado" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Space>
          <Switch size="small" checked={showInactive} onChange={setShowInactive} id="show-inactive-people" />
          <label htmlFor="show-inactive-people">Ver inactivas</label>
        </Space>
        <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
          <Button type="primary" disabled={!canEdit} onClick={() => open()}>
            Nueva persona
          </Button>
        </Tooltip>
      </div>
      <Table<Person>
        size="small"
        rowKey="id"
        dataSource={people}
        pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `${total} personas` }}
        locale={{ emptyText: query ? 'Nadie coincide con la búsqueda' : 'Aún no hay personas' }}
        columns={[
          {
            title: 'Nombre',
            render: (_, p) => (
              <Space>
                {p.displayName}
                {p.status === 'inactive' && <Tag>Inactiva</Tag>}
              </Space>
            ),
          },
          { title: 'Identificador', render: (_, p) => p.account ?? p.employeeNumber ?? <span className="muted">Sin identificador</span> },
          {
            title: 'Roles',
            render: (_, p) =>
              assignmentsOf(p.id).length ? (
                <Space size={[4, 4]} wrap>
                  {assignmentsOf(p.id).map((a) => (
                    <Tag key={a.id}>
                      {roleName(a.roleId)} · {unitName(a.orgUnitId)}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <span className="muted">Sin rol</span>
              ),
          },
          { title: 'Equipos', align: 'right', render: (_, p) => membershipsOf(p.id).length },
          {
            title: '',
            align: 'right',
            render: (_, p) => (
              <Space>
                {p.status === 'active' ? (
                  <>
                    <Button size="small" disabled={!canEdit} onClick={() => open(p)}>
                      Editar
                    </Button>
                    <Popconfirm title={`¿Desactivar a «${p.displayName}»?`} description="Se revocan sus roles, sale de sus equipos y los que lidera quedan sin líder." okText="Desactivar" cancelText="Cancelar" onConfirm={() => deactivate(p)} disabled={!canEdit}>
                      <Button size="small" danger disabled={!canEdit}>
                        Desactivar
                      </Button>
                    </Popconfirm>
                  </>
                ) : (
                  <Button size="small" disabled={!canEdit} onClick={() => reactivate(p)}>
                    Reactivar
                  </Button>
                )}
                <Button size="small" type="link" onClick={() => onHistory(p.id, p.displayName)}>
                  Historial
                </Button>
              </Space>
            ),
          },
        ]}
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
