import type { OrgUnit } from '@origo/capital-humano';
import { ORG_UNIT_KINDS } from '@origo/capital-humano';
import { Button, Card, Descriptions, Empty, Form, Input, List, Modal, Popconfirm, Segmented, Select, Space, Switch, Tag, Tooltip, Tree, TreeSelect } from 'antd';
import { useMemo, useState, type Key } from 'react';
import { useSave } from '../hooks';
import { KIND_LABEL, count, normalize, unitPath, unitTree } from '../lib';
import { READ_ONLY_HINT, type TabProps } from '../types';
import { areaItems } from '../chartItems';
import { CropDot, CropSeal, cropLegend, cropsOf } from '../crops';
import { TreeChart } from './TreeChart';

type Draft = Partial<OrgUnit>;

type View = 'diagram' | 'list';

export function AreasTab({ org, canEdit, onHistory, mode, scope, onScope }: TabProps) {
  const [view, setView] = useState<View>('diagram');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Key[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form] = Form.useForm<Draft>();
  const save = useSave();

  const units = useMemo(() => org.orgUnits.filter((u) => (showInactive || u.status === 'active') && (!scope || scope.has(u.id))), [org.orgUnits, showInactive, scope]);
  const teamsIn = (id: string) => org.teams.filter((t) => t.orgUnitId === id && t.status === 'active');
  const assignmentsIn = (id: string) => org.roleAssignments.filter((a) => a.orgUnitId === id && a.status === 'active');

  // A search keeps each match together with its ancestors, so the path to it stays visible.
  const query = normalize(search);
  const visible = useMemo(() => {
    if (!query) return units;
    const keep = new Set<string>();
    for (const match of units.filter((u) => normalize(`${u.name} ${u.code}`).includes(query))) {
      for (let unit: OrgUnit | undefined = match; unit && !keep.has(unit.id); unit = units.find((u) => u.id === unit!.parentId)) keep.add(unit.id);
    }
    return units.filter((u) => keep.has(u.id));
  }, [units, query]);

  const crops = useMemo(() => cropsOf(org.orgUnits), [org.orgUnits]);
  const legend = useMemo(() => cropLegend(org.orgUnits, scope), [org.orgUnits, scope]);
  const treeData = unitTree(visible, (unit) => (
    <span className={unit.status === 'inactive' ? 'muted' : undefined}>
      <CropDot crop={crops.get(unit.id)} />
      {unit.name}{' '}
      <span className="muted">
        · {count(teamsIn(unit.id).length, 'equipo', 'equipos')} · {count(new Set(assignmentsIn(unit.id).map((a) => a.personId)).size, 'persona', 'personas')}
      </span>
      {unit.status === 'inactive' && <Tag style={{ marginLeft: 8 }}>Inactiva</Tag>}
    </span>
  ));
  // The first two levels shown start open; with a filter, the top is the filtered área.
  const isTop = (u: OrgUnit) => !units.some((p) => p.id === u.parentId);
  const topLevels = units.filter((u) => isTop(u) || units.some((p) => p.id === u.parentId && isTop(p))).map((u) => u.id);
  const expandedKeys = query ? visible.map((u) => u.id) : (expanded ?? topLevels);
  const selected = org.orgUnits.find((u) => u.id === selectedId) ?? null;

  const open = (value: Draft) => {
    setDraft(value);
    form.resetFields();
    form.setFieldsValue(value);
  };
  const submit = (values: Draft) =>
    save.mutate(
      { changes: [{ kind: 'orgUnit', data: { ...draft, ...values, parentId: values.parentId ?? null } }], done: 'Área guardada' },
      { onSuccess: () => setDraft(null) },
    );
  const setStatus = (unit: OrgUnit, status: OrgUnit['status']) =>
    save.mutate({ changes: [{ kind: 'orgUnit', data: { ...unit, status } }], done: status === 'active' ? 'Área reactivada' : 'Área desactivada' });

  const selectedCrop = selected ? crops.get(selected.id) : undefined;
  const detailTitle = selected ? (
    <Space size={8}>
      {selectedCrop && <CropSeal crop={selectedCrop} size={24} />}
      {selected.name}
    </Space>
  ) : (
    'Detalle del área'
  );
  const chartItems = useMemo(() => areaItems(org, units), [org, units]);
  const matchIds = useMemo(() => (query ? units.filter((u) => normalize(`${u.name} ${u.code}`).includes(query)).map((u) => u.id) : undefined), [units, query]);
  return (
    <div>
      <div className="toolbar">
        <Input.Search className="grow" allowClear placeholder="Buscar área por nombre o código" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Segmented<View> value={view} onChange={setView} options={[{ value: 'diagram', label: 'Diagrama' }, { value: 'list', label: 'Lista' }]} />
        <Space>
          <Switch size="small" checked={showInactive} onChange={setShowInactive} id="show-inactive" />
          <label htmlFor="show-inactive">Ver inactivas</label>
        </Space>
        {!org.orgUnits.length && (
          <Button type="primary" disabled={!canEdit} onClick={() => open({ kind: 'empresa', parentId: null })}>
            Crear la empresa
          </Button>
        )}
      </div>
    <div className={view === 'diagram' ? 'chart-stage' : 'split'}>
      {view === 'diagram' ? (
        <TreeChart items={chartItems} legend={legend} matchIds={matchIds} selectedId={selectedId} onSelect={setSelectedId} mode={mode} emptyText={query ? 'Ningún área coincide con la búsqueda' : 'Aún no hay áreas. Usa la pestaña Carga o crea la primera.'} />
      ) : (
      <Card size="small">
        <div className="tree-scroll">
          {treeData.length ? (
            <Tree
              blockNode
              treeData={treeData}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpanded(keys)}
              selectedKeys={selectedId ? [selectedId] : []}
              onSelect={(keys) => setSelectedId((keys[0] as string) ?? null)}
            />
          ) : (
            <Empty description={query ? 'Ningún área coincide con la búsqueda' : 'Aún no hay áreas. Usa la pestaña Carga o crea la primera.'} />
          )}
        </div>
      </Card>
      )}

      {(view === 'list' || selected) && (
      <Card
        size="small"
        className={view === 'diagram' ? 'chart-detail' : undefined}
        title={detailTitle}
        extra={view === 'diagram' ? <Button type="text" size="small" aria-label="Cerrar detalle" onClick={() => setSelectedId(null)}>✕</Button> : undefined}
      >
        {!selected ? (
          <Empty description="Elige un área del árbol para ver su detalle" />
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Código">{selected.code}</Descriptions.Item>
              <Descriptions.Item label="Tipo">{KIND_LABEL[selected.kind]}</Descriptions.Item>
              <Descriptions.Item label="Ubicación">{unitPath(org.orgUnits, selected.id)}</Descriptions.Item>
              <Descriptions.Item label="Estado">{selected.status === 'active' ? 'Activa' : 'Inactiva'}</Descriptions.Item>
            </Descriptions>
            <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
              <Space wrap>
                <Button type="primary" disabled={!canEdit || selected.status !== 'active'} onClick={() => open({ parentId: selected.id, kind: selected.kind === 'empresa' ? 'direccion' : selected.kind === 'direccion' ? 'area' : 'subarea' })}>
                  Agregar área dentro
                </Button>
                <Button disabled={!canEdit} onClick={() => open(selected)}>
                  Editar o mover
                </Button>
                {selected.status === 'active' ? (
                  <Popconfirm title={`¿Desactivar «${selected.name}»?`} description="Su historial se conserva." okText="Desactivar" cancelText="Cancelar" onConfirm={() => setStatus(selected, 'inactive')} disabled={!canEdit}>
                    <Button danger disabled={!canEdit}>
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
            {scope && !scope.has(selected.parentId ?? '') ? (
              <Button block onClick={() => onScope(null)}>
                Ver toda la organización
              </Button>
            ) : (
              selected.parentId !== null && (
                <Button block onClick={() => onScope(selected.id)}>
                  Ver solo esta área
                </Button>
              )
            )}
            <List
              size="small"
              header={<strong>Equipos ({teamsIn(selected.id).length})</strong>}
              locale={{ emptyText: 'Sin equipos en esta área' }}
              dataSource={teamsIn(selected.id)}
              renderItem={(team) => (
                <List.Item>
                  {team.name} <span className="muted">· {count(org.teamMemberships.filter((m) => m.teamId === team.id && m.status === 'active').length, 'integrante', 'integrantes')}</span>
                </List.Item>
              )}
            />
            <List
              size="small"
              header={<strong>Personas con rol aquí ({assignmentsIn(selected.id).length})</strong>}
              locale={{ emptyText: 'Nadie tiene un rol asignado directamente en esta área' }}
              pagination={assignmentsIn(selected.id).length > 8 ? { pageSize: 8, size: 'small' } : false}
              dataSource={assignmentsIn(selected.id)}
              renderItem={(a) => (
                <List.Item>
                  {org.people.find((p) => p.id === a.personId)?.displayName}{' '}
                  <span className="muted">· {a.jobTitle ?? org.roles.find((r) => r.id === a.roleId)?.name}</span>
                </List.Item>
              )}
            />
          </Space>
        )}
      </Card>
      )}
    </div>

      <Modal
        open={draft !== null}
        title={draft?.id ? 'Editar o mover área' : 'Nueva área'}
        okText="Guardar"
        cancelText="Cancelar"
        confirmLoading={save.isPending}
        onCancel={() => setDraft(null)}
        onOk={() => form.submit()}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="Nombre" rules={[{ required: true, message: 'Escribe el nombre del área' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="Código" extra="Letras, números, guion y guion bajo. No se repite." rules={[{ required: true, message: 'Escribe un código' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="kind" label="Tipo" rules={[{ required: true, message: 'Elige el tipo' }]}>
            <Select options={ORG_UNIT_KINDS.map((kind) => ({ value: kind, label: KIND_LABEL[kind] }))} />
          </Form.Item>
          <Form.Item name="parentId" label="Área superior" extra="Cambiarla mueve el área con todo lo que tiene debajo.">
            <TreeSelect allowClear treeDefaultExpandAll showSearch treeNodeFilterProp="title" placeholder="Sin área superior (solo la empresa)" treeData={unitTree(org.orgUnits.filter((u) => u.status === 'active' && u.id !== draft?.id))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
