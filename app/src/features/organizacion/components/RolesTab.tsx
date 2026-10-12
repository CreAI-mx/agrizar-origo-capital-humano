import type { Role } from '@origo/capital-humano';
import { ROLE_LEVELS } from '@origo/capital-humano';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip } from 'antd';
import { useState } from 'react';
import { useSave } from '../hooks';
import { READ_ONLY_HINT, type TabProps } from '../types';

type Draft = Partial<Role>;
const levelLabel = (level: string) => level.charAt(0).toUpperCase() + level.slice(1).replace('ider', 'íder');

export function RolesTab({ org, canEdit, onHistory }: TabProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form] = Form.useForm<Draft>();
  const save = useSave();
  const holders = (roleId: string) => org.roleAssignments.filter((a) => a.roleId === roleId && a.status === 'active').length;

  const open = (value: Draft) => {
    setDraft(value);
    form.resetFields();
    form.setFieldsValue(value);
  };
  const submit = (values: Draft) =>
    save.mutate({ changes: [{ kind: 'role', data: { ...draft, ...values, level: values.level ?? null } }], done: 'Rol guardado' }, { onSuccess: () => setDraft(null) });
  const setStatus = (role: Role, status: Role['status']) =>
    save.mutate({ changes: [{ kind: 'role', data: { ...role, status } }], done: status === 'active' ? 'Rol reactivado' : 'Rol desactivado' });

  return (
    <>
      <div className="toolbar">
        <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
          <Button type="primary" disabled={!canEdit} onClick={() => open({})}>
            Nuevo rol
          </Button>
        </Tooltip>
      </div>
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
