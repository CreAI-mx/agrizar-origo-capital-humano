import type { Team } from '@origo/capital-humano';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tooltip, TreeSelect } from 'antd';
import { useMemo, useState } from 'react';
import type { Change } from '../api';
import { useSave } from '../hooks';
import { normalize, unitPath, unitTree } from '../lib';
import { READ_ONLY_HINT, type TabProps } from '../types';

interface Draft {
  id?: string;
  orgUnitId?: string;
  code?: string;
  name?: string;
  leadPersonId?: string | null;
  memberIds: string[];
}

export function TeamsTab({ org, canEdit, onHistory }: TabProps) {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form] = Form.useForm<Draft>();
  const chosenMembers = Form.useWatch('memberIds', form) ?? [];
  const save = useSave();

  const people = useMemo(() => org.people.filter((p) => p.status === 'active'), [org.people]);
  const nameOf = (personId: string | null) => org.people.find((p) => p.id === personId)?.displayName;
  const membersOf = (teamId: string) => org.teamMemberships.filter((m) => m.teamId === teamId && m.status === 'active');
  const query = normalize(search);
  const teams = org.teams
    .filter((t) => t.status === 'active')
    .filter((t) => !query || normalize(`${t.name} ${t.code} ${unitPath(org.orgUnits, t.orgUnitId)}`).includes(query));

  const open = (team?: Team) => {
    const value: Draft = team ? { ...team, memberIds: membersOf(team.id).map((m) => m.personId) } : { memberIds: [] };
    setDraft(value);
    form.resetFields();
    form.setFieldsValue(value);
  };
  const submit = (values: Draft) => {
    const id = draft?.id ?? crypto.randomUUID();
    const current = draft?.id ? membersOf(draft.id) : [];
    const changes: Change[] = [
      { kind: 'team', data: { id, orgUnitId: values.orgUnitId, code: values.code, name: values.name, leadPersonId: values.leadPersonId ?? null, status: 'active' } },
      ...values.memberIds.filter((personId) => !current.some((m) => m.personId === personId)).map((personId): Change => ({ kind: 'teamMembership', data: { teamId: id, personId } })),
      ...current.filter((m) => !values.memberIds.includes(m.personId)).map((m): Change => ({ kind: 'teamMembership', data: { ...m, status: 'removed' } })),
    ];
    save.mutate({ changes, done: 'Equipo guardado' }, { onSuccess: () => setDraft(null) });
  };
  // Members leave first: an equipo with integrantes cannot be deactivated.
  const deactivate = (team: Team) =>
    save.mutate({
      changes: [...membersOf(team.id).map((m): Change => ({ kind: 'teamMembership', data: { ...m, status: 'removed' } })), { kind: 'team', data: { ...team, leadPersonId: null, status: 'inactive' } }],
      done: 'Equipo desactivado',
    });

  return (
    <>
      <div className="toolbar">
        <Input.Search className="grow" allowClear placeholder="Buscar equipo o área" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
          <Button type="primary" disabled={!canEdit} onClick={() => open()}>
            Nuevo equipo
          </Button>
        </Tooltip>
      </div>
      <Table<Team>
        size="small"
        rowKey="id"
        dataSource={teams}
        pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `${total} equipos` }}
        locale={{ emptyText: query ? 'Ningún equipo coincide con la búsqueda' : 'Aún no hay equipos' }}
        columns={[
          { title: 'Equipo', render: (_, team) => team.name },
          { title: 'Área', render: (_, team) => unitPath(org.orgUnits, team.orgUnitId) },
          { title: 'Líder', render: (_, team) => nameOf(team.leadPersonId) ?? <span className="muted">Sin líder</span> },
          { title: 'Integrantes', align: 'right', render: (_, team) => membersOf(team.id).length },
          {
            title: '',
            align: 'right',
            render: (_, team) => (
              <Space>
                <Button size="small" disabled={!canEdit} onClick={() => open(team)}>
                  Editar
                </Button>
                <Popconfirm title={`¿Desactivar «${team.name}»?`} description="Sus integrantes salen del equipo." okText="Desactivar" cancelText="Cancelar" onConfirm={() => deactivate(team)} disabled={!canEdit}>
                  <Button size="small" danger disabled={!canEdit}>
                    Desactivar
                  </Button>
                </Popconfirm>
                <Button size="small" type="link" onClick={() => onHistory(team.id, team.name)}>
                  Historial
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal open={draft !== null} title={draft?.id ? 'Editar equipo' : 'Nuevo equipo'} okText="Guardar" cancelText="Cancelar" confirmLoading={save.isPending} onCancel={() => setDraft(null)} onOk={() => form.submit()} forceRender>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="orgUnitId" label="Área" rules={[{ required: true, message: 'Elige el área del equipo' }]}>
            <TreeSelect treeDefaultExpandAll showSearch treeNodeFilterProp="title" treeData={unitTree(org.orgUnits.filter((u) => u.status === 'active'))} />
          </Form.Item>
          <Form.Item name="name" label="Nombre" rules={[{ required: true, message: 'Escribe el nombre del equipo' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="Código" extra="No se repite dentro de la misma área." rules={[{ required: true, message: 'Escribe un código' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="memberIds" label="Integrantes">
            <Select mode="multiple" optionFilterProp="label" placeholder="Busca por nombre" options={people.map((p) => ({ value: p.id, label: p.displayName }))} />
          </Form.Item>
          <Form.Item name="leadPersonId" label="Líder" extra="Debe ser uno de los integrantes.">
            <Select allowClear placeholder="Sin líder" options={people.filter((p) => chosenMembers.includes(p.id)).map((p) => ({ value: p.id, label: p.displayName }))} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
