import type { Role } from '@origo/capital-humano';
import { ROLE_LEVELS } from '@origo/capital-humano';
import { Button, Card, Descriptions, Form, Input, List, Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { useSave } from '../hooks';
import { count } from '../lib';
import { READ_ONLY_HINT, type TabProps } from '../types';
import { RoleMatrix } from './RoleMatrix';
import { TreeChart, type ChartItem } from './TreeChart';

type Draft = Partial<Role>;
const levelLabel = (level: string) => level.charAt(0).toUpperCase() + level.slice(1).replace('ider', 'íder');

type View = 'matrix' | 'diagram' | 'list';

export function RolesTab({ org, canEdit, onHistory, mode, scope, onShowPeople }: TabProps) {
  const [view, setView] = useState<View>('matrix');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form] = Form.useForm<Draft>();
  const save = useSave();
  // With an área filter, a role counts only the people who hold it there.
  const held = org.roleAssignments.filter((a) => a.status === 'active' && (!scope || scope.has(a.orgUnitId)));
  // The same person can hold a role on several áreas: they count once.
  const holders = (roleId: string) => new Set(held.filter((a) => a.roleId === roleId).map((a) => a.personId)).size;

  const open = (value: Draft) => {
    setDraft(value);
    form.resetFields();
    form.setFieldsValue(value);
  };
  const submit = (values: Draft) =>
    save.mutate({ changes: [{ kind: 'role', data: { ...draft, ...values, level: values.level ?? null } }], done: 'Rol guardado' }, { onSuccess: () => setDraft(null) });
  const setStatus = (role: Role, status: Role['status']) =>
    save.mutate({ changes: [{ kind: 'role', data: { ...role, status } }], done: status === 'active' ? 'Rol reactivado' : 'Rol desactivado' });

  // The ladder runs left to right from director down; roles without a level get their own row under it.
  const items = useMemo<ChartItem[]>(() => {
    const ladder = org.roles.filter((r) => r.level).sort((a, b) => ROLE_LEVELS.indexOf(a.level!) - ROLE_LEVELS.indexOf(b.level!) || a.name.localeCompare(b.name, 'es'));
    const others = org.roles.filter((r) => !r.level).sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name, 'es'));
    const card = (role: Role, parentId: string): ChartItem => ({
      id: role.id,
      parentId,
      eyebrow: role.status === 'inactive' ? 'Inactivo' : role.isSystem ? 'Del sistema' : role.level ? `Nivel ${ROLE_LEVELS.indexOf(role.level) + 1}` : 'Sin nivel',
      title: role.name,
      line1: count(holders(role.id), 'persona', 'personas'),
      line2: role.code,
      badge: holders(role.id),
      tone: role.isSystem ? 'team' : 'normal',
      inactive: role.status === 'inactive',
    });
    const active = org.roles.filter((r) => r.status === 'active').length;
    return [
      { id: 'roles', parentId: null, eyebrow: 'Catálogo', title: 'Roles de Agrizar', line1: count(active, 'rol activo', 'roles activos'), tone: 'root', selectable: false },
      { id: 'ladder', parentId: 'roles', eyebrow: 'Grupo', title: 'Escalafón', line1: 'De director a practicante', line2: count(ladder.length, 'rol', 'roles'), tone: 'group', selectable: false, row: 'ordered' },
      ...ladder.map((role) => card(role, 'ladder')),
      { id: 'others', parentId: 'roles', eyebrow: 'Grupo', title: 'Fuera del escalafón', line1: 'Roles de acceso y otros puestos', line2: count(others.length, 'rol', 'roles'), tone: 'group', selectable: false, row: 'plain' },
      ...others.map((role) => card(role, 'others')),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.roles, org.roleAssignments, scope]);

  const selected = org.roles.find((r) => r.id === selectedId) ?? null;
  const usedIn = selected
    ? [...held.filter((a) => a.roleId === selected.id).reduce((map, a) => map.set(a.orgUnitId, (map.get(a.orgUnitId) ?? 0) + 1), new Map<string, number>())]
        .map(([orgUnitId, people]) => ({ name: org.orgUnits.find((u) => u.id === orgUnitId)?.name ?? '', people }))
        .sort((a, b) => b.people - a.people)
    : [];

  // The same detail serves the diagram, where it floats over the chart, and the matrix, beside it.
  const detail = (className: string) =>
    selected && (
            <Card size="small" className={className} title={selected.name} extra={<Button type="text" size="small" aria-label="Cerrar detalle" onClick={() => setSelectedId(null)}>✕</Button>}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="Código">{selected.code}</Descriptions.Item>
                  <Descriptions.Item label="Nivel">{selected.level ? levelLabel(selected.level) : 'Fuera del escalafón'}</Descriptions.Item>
                  <Descriptions.Item label="Personas">{holders(selected.id)}</Descriptions.Item>
                  {selected.description && <Descriptions.Item label="Descripción">{selected.description}</Descriptions.Item>}
                </Descriptions>
                <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
                  <Space wrap>
                    <Button type="primary" disabled={!canEdit} onClick={() => open(selected)}>
                      Editar
                    </Button>
                    {selected.status === 'active' ? (
                      <Popconfirm title={`¿Desactivar el rol «${selected.name}»?`} okText="Desactivar" cancelText="Cancelar" onConfirm={() => setStatus(selected, 'inactive')} disabled={!canEdit || selected.isSystem}>
                        <Button danger disabled={!canEdit || selected.isSystem}>
                          Desactivar
                        </Button>
                      </Popconfirm>
                    ) : (
                      <Button disabled={!canEdit} onClick={() => setStatus(selected, 'active')}>
                        Reactivar
                      </Button>
                    )}
                    <Button type="link" onClick={() => onHistory(selected.id, selected.name)}>
                      Historial
                    </Button>
                  </Space>
                </Tooltip>
                <List
                  size="small"
                  header={<strong>Áreas donde se usa ({usedIn.length})</strong>}
                  locale={{ emptyText: 'Nadie tiene este rol todavía' }}
                  pagination={usedIn.length > 8 ? { pageSize: 8, size: 'small' } : false}
                  dataSource={usedIn}
                  renderItem={(row) => (
                    <List.Item>
                      {row.name} <span className="muted">· {count(row.people, 'persona', 'personas')}</span>
                    </List.Item>
                  )}
                />
              </Space>
            </Card>
    );

  return (
    <>
      <div className="toolbar">
        <Segmented<View> value={view} onChange={setView} options={[{ value: 'matrix', label: 'Matriz' }, { value: 'diagram', label: 'Diagrama' }, { value: 'list', label: 'Lista' }]} />
        <span className="grow" />
        <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
          <Button type="primary" disabled={!canEdit} onClick={() => open({})}>
            Nuevo rol
          </Button>
        </Tooltip>
      </div>
      {view === 'matrix' && (
        <div className="matrix-layout">
          <RoleMatrix org={org} held={held} scope={scope} selectedId={selectedId} onRole={(id) => setSelectedId(id === selectedId ? null : id)} onCell={onShowPeople} />
          {detail('matrix-detail')}
        </div>
      )}
      {view === 'diagram' && (
        <div className="chart-stage">
          <TreeChart items={items} mode={mode} selectedId={selectedId} onSelect={setSelectedId} emptyText="Aún no hay roles" />
          {detail('chart-detail')}
        </div>
      )}
      {view === 'list' && (
      <Table<Role>
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={[...org.roles].sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name, 'es'))}
        columns={[
          {
            title: 'Rol',
            render: (_, role) => (
              <Space>
                {role.name}
                {role.isSystem && <Tag color="gold">Del sistema</Tag>}
                {role.status === 'inactive' && <Tag>Inactivo</Tag>}
              </Space>
            ),
          },
          { title: 'Código', dataIndex: 'code' },
          { title: 'Nivel', render: (_, role) => (role.level ? levelLabel(role.level) : <span className="muted">Fuera del escalafón</span>) },
          { title: 'Personas', align: 'right', render: (_, role) => holders(role.id) },
          {
            title: '',
            align: 'right',
            render: (_, role) => (
              <Space>
                <Button size="small" disabled={!canEdit} onClick={() => open(role)}>
                  Editar
                </Button>
                {role.status === 'active' ? (
                  <Popconfirm title={`¿Desactivar el rol «${role.name}»?`} okText="Desactivar" cancelText="Cancelar" onConfirm={() => setStatus(role, 'inactive')} disabled={!canEdit || role.isSystem}>
                    <Button size="small" danger disabled={!canEdit || role.isSystem}>
                      Desactivar
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button size="small" disabled={!canEdit} onClick={() => setStatus(role, 'active')}>
                    Reactivar
                  </Button>
                )}
                <Button size="small" type="link" onClick={() => onHistory(role.id, role.name)}>
                  Historial
                </Button>
              </Space>
            ),
          },
        ]}
      />
      )}
      <Modal open={draft !== null} title={draft?.id ? 'Editar rol' : 'Nuevo rol'} okText="Guardar" cancelText="Cancelar" confirmLoading={save.isPending} onCancel={() => setDraft(null)} onOk={() => form.submit()} forceRender>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="Nombre" rules={[{ required: true, message: 'Escribe el nombre del rol' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="Código" rules={[{ required: true, message: 'Escribe un código' }]}>
            <Input disabled={draft?.isSystem} />
          </Form.Item>
          <Form.Item name="level" label="Nivel en el escalafón">
            <Select allowClear placeholder="Fuera del escalafón" options={ROLE_LEVELS.map((level) => ({ value: level, label: levelLabel(level) }))} />
          </Form.Item>
          <Form.Item name="description" label="Descripción">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
