import type { Team } from '@origo/capital-humano';
import { Button, Card, Descriptions, Form, Input, List, Modal, Popconfirm, Segmented, Select, Space, Switch, Table, Tag, Tooltip, TreeSelect } from 'antd';
import { useMemo, useState } from 'react';
import type { Change } from '../api';
import { useSave } from '../hooks';
import { UNIT_TONE } from '../chartItems';
import { CropDot, cropLegend, cropsOf } from '../crops';
import { KIND_LABEL, count, normalize, sortUnits, unitPath, unitTree } from '../lib';
import { READ_ONLY_HINT, type TabProps } from '../types';
import { TreeChart, type ChartItem } from './TreeChart';

interface Draft {
  id?: string;
  orgUnitId?: string;
  code?: string;
  name?: string;
  leadPersonId?: string | null;
  memberIds: string[];
}

type View = 'diagram' | 'list';

export function TeamsTab({ org, canEdit, onHistory, mode, scope }: TabProps) {
  const [view, setView] = useState<View>('diagram');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form] = Form.useForm<Draft>();
  const chosenMembers = Form.useWatch('memberIds', form) ?? [];
  const save = useSave();

  const people = useMemo(() => org.people.filter((p) => p.status === 'active'), [org.people]);
  const nameOf = (personId: string | null) => org.people.find((p) => p.id === personId)?.displayName;
  const membersOf = (teamId: string) => org.teamMemberships.filter((m) => m.teamId === teamId && m.status === 'active');
  const query = normalize(search);
  const allTeams = useMemo(() => org.teams.filter((t) => (showInactive || t.status === 'active') && (!scope || scope.has(t.orgUnitId))), [org.teams, showInactive, scope]);
  const teams = allTeams
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
  const reactivate = (team: Team) => save.mutate({ changes: [{ kind: 'team', data: { ...team, status: 'active' } }], done: 'Equipo reactivado' });

  // Only the áreas that lead to an equipo are drawn; each equipo opens to show its integrantes.
  const { items, closed } = useMemo(() => {
    const units = org.orgUnits.filter((u) => u.status === 'active' && (!scope || scope.has(u.id)));
    const needed = new Set<string>();
    for (const team of allTeams) {
      for (let unit = units.find((u) => u.id === team.orgUnitId); unit && !needed.has(unit.id); unit = units.find((u) => u.id === unit!.parentId)) needed.add(unit.id);
    }
    const teamsUnder = (id: string): number =>
      allTeams.filter((t) => t.orgUnitId === id).length + units.filter((u) => u.parentId === id).reduce((sum, child) => sum + teamsUnder(child.id), 0);
    const cards: ChartItem[] = [];
    const crops = cropsOf(org.orgUnits);
    for (const unit of sortUnits(units.filter((u) => needed.has(u.id)))) {
      cards.push({ id: unit.id, parentId: unit.parentId, eyebrow: KIND_LABEL[unit.kind], title: unit.name, line1: count(teamsUnder(unit.id), 'equipo', 'equipos'), line2: allTeams.some((t) => t.orgUnitId === unit.id) ? 'Abre el área para ver sus equipos' : null, tone: UNIT_TONE[unit.kind], crop: crops.get(unit.id) ?? null, selectable: false });
    }
    for (const team of [...allTeams].sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
      const members = org.teamMemberships.filter((m) => m.teamId === team.id && m.status === 'active');
      cards.push({ id: team.id, parentId: team.orgUnitId, eyebrow: team.status === 'inactive' ? 'Equipo inactivo' : 'Equipo', inactive: team.status === 'inactive', title: team.name, line1: org.people.find((p) => p.id === team.leadPersonId)?.displayName ?? 'Sin líder', line2: team.code, badge: members.length, badgeTitle: count(members.length, 'integrante', 'integrantes'), tone: 'team', crop: crops.get(team.orgUnitId) ?? null });
      for (const member of [...members].sort((a, b) => Number(b.personId === team.leadPersonId) - Number(a.personId === team.leadPersonId))) {
        const title = org.roleAssignments.find((a) => a.personId === member.personId && a.status === 'active')?.jobTitle;
        cards.push({ id: `member:${member.id}`, parentId: team.id, eyebrow: member.personId === team.leadPersonId ? 'Líder' : 'Integrante', title: org.people.find((p) => p.id === member.personId)?.displayName ?? '', line1: title ?? null, tone: 'person', selectable: false });
      }
    }
    return { items: cards, closed: [...new Set(allTeams.map((t) => t.orgUnitId)), ...allTeams.map((t) => t.id)] };
  }, [org, allTeams, scope]);
  const matchIds = query ? teams.map((t) => t.id) : undefined;
  const crops = useMemo(() => cropsOf(org.orgUnits), [org.orgUnits]);
  const legend = useMemo(() => cropLegend(org.orgUnits, scope), [org.orgUnits, scope]);
  const selected = allTeams.find((t) => t.id === selectedId) ?? null;

  return (
    <>
      <div className="toolbar">
        <Input.Search className="grow" allowClear placeholder="Buscar equipo o área" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Segmented<View> value={view} onChange={setView} options={[{ value: 'diagram', label: 'Diagrama' }, { value: 'list', label: 'Lista' }]} />
        <Space>
          <Switch size="small" checked={showInactive} onChange={setShowInactive} id="show-inactive-teams" />
          <label htmlFor="show-inactive-teams">Ver inactivos</label>
        </Space>
        <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
          <Button type="primary" disabled={!canEdit} onClick={() => open()}>
            Nuevo equipo
          </Button>
        </Tooltip>
      </div>
      {view === 'diagram' && (
        <div className="chart-stage">
          <TreeChart items={items} mode={mode} legend={legend} matchIds={matchIds} selectedId={selectedId} onSelect={setSelectedId} initiallyCollapsed={closed} emptyText={query ? 'Ningún equipo coincide con la búsqueda' : 'Aún no hay equipos'} />
          {selected && (
            <Card size="small" className="chart-detail" title={selected.name} extra={<Button type="text" size="small" aria-label="Cerrar detalle" onClick={() => setSelectedId(null)}>✕</Button>}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="Código">{selected.code}</Descriptions.Item>
                  <Descriptions.Item label="Área">{unitPath(org.orgUnits, selected.orgUnitId)}</Descriptions.Item>
                  <Descriptions.Item label="Líder">{nameOf(selected.leadPersonId) ?? 'Sin líder'}</Descriptions.Item>
                </Descriptions>
                <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
                  <Space wrap>
                    {selected.status === 'active' ? (
                      <>
                        <Button type="primary" disabled={!canEdit} onClick={() => open(selected)}>
                          Editar integrantes
                        </Button>
                        <Popconfirm title={`¿Desactivar «${selected.name}»?`} description="Sus integrantes salen del equipo." okText="Desactivar" cancelText="Cancelar" onConfirm={() => deactivate(selected)} disabled={!canEdit}>
                          <Button danger disabled={!canEdit}>
                            Desactivar
                          </Button>
                        </Popconfirm>
                      </>
                    ) : (
                      <Button disabled={!canEdit} onClick={() => reactivate(selected)}>
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
                  header={<strong>Integrantes ({membersOf(selected.id).length})</strong>}
                  locale={{ emptyText: 'Este equipo no tiene integrantes' }}
                  pagination={membersOf(selected.id).length > 10 ? { pageSize: 10, size: 'small' } : false}
                  dataSource={membersOf(selected.id)}
                  renderItem={(member) => (
                    <List.Item>
                      {nameOf(member.personId)} {member.personId === selected.leadPersonId && <Tag color="green">Líder</Tag>}
                    </List.Item>
                  )}
                />
              </Space>
            </Card>
          )}
        </div>
      )}
      {view === 'list' && (
      <Table<Team>
        size="small"
        rowKey="id"
        dataSource={teams}
        pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `${total} equipos` }}
        locale={{ emptyText: query ? 'Ningún equipo coincide con la búsqueda' : 'Aún no hay equipos' }}
        columns={[
          {
            title: 'Equipo',
            render: (_, team) => (
              <Space>
                {team.name}
                {team.status === 'inactive' && <Tag>Inactivo</Tag>}
              </Space>
            ),
          },
          {
            title: 'Área',
            render: (_, team) => (
              <>
                <CropDot crop={crops.get(team.orgUnitId)} />
                {unitPath(org.orgUnits, team.orgUnitId)}
              </>
            ),
          },
          { title: 'Líder', render: (_, team) => nameOf(team.leadPersonId) ?? <span className="muted">Sin líder</span> },
          { title: 'Integrantes', align: 'right', render: (_, team) => membersOf(team.id).length },
          {
            title: '',
            align: 'right',
            render: (_, team) => (
              <Space>
                {team.status === 'active' ? (
                  <>
                    <Button size="small" disabled={!canEdit} onClick={() => open(team)}>
                      Editar
                    </Button>
                    <Popconfirm title={`¿Desactivar «${team.name}»?`} description="Sus integrantes salen del equipo." okText="Desactivar" cancelText="Cancelar" onConfirm={() => deactivate(team)} disabled={!canEdit}>
                      <Button size="small" danger disabled={!canEdit}>
                        Desactivar
                      </Button>
                    </Popconfirm>
                  </>
                ) : (
                  <Button size="small" disabled={!canEdit} onClick={() => reactivate(team)}>
                    Reactivar
                  </Button>
                )}
                <Button size="small" type="link" onClick={() => onHistory(team.id, team.name)}>
                  Historial
                </Button>
              </Space>
            ),
          },
        ]}
      />
      )}
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
