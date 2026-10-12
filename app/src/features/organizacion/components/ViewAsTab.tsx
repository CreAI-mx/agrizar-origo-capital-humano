import { Alert, Card, Empty, List, Select, Space, Spin, Tag, Tree } from 'antd';
import { useState } from 'react';
import { useAccess } from '../hooks';
import { unitPath, unitTree } from '../lib';
import type { TabProps } from '../types';

/** Spec M2-22: what a given person's roles cover. This is what will govern access to views. */
export function ViewAsTab({ org }: TabProps) {
  const [personId, setPersonId] = useState<string>();
  const access = useAccess(personId);
  const covered = org.orgUnits.filter((u) => access.data?.orgUnitIds.includes(u.id));
  const activeUnits = org.orgUnits.filter((u) => u.status === 'active').length;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Select
        showSearch
        allowClear
        style={{ width: 'min(100%, 420px)' }}
        placeholder="Elige una persona para ver qué cubre"
        optionFilterProp="label"
        value={personId}
        onChange={setPersonId}
        options={org.people.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.displayName }))}
      />
      {!personId ? (
        <Empty description="Aquí verás las áreas y equipos que cubren los roles de una persona" />
      ) : access.isLoading || !access.data ? (
        <Spin />
      ) : (
        <div className="split">
          <Card size="small" title="Roles y equipos">
            {access.data.isAdmin && <Alert style={{ marginBottom: 12 }} type="warning" showIcon message="Es Administrador de Origo: puede cambiar la organización." />}
            <List
              size="small"
              header={<strong>Roles</strong>}
              locale={{ emptyText: 'No tiene roles: no cubre ningún área' }}
              dataSource={access.data.roles}
              renderItem={(role) => (
                <List.Item>
                  <Tag>{role.name}</Tag> en {role.orgUnitName}
                  {role.jobTitle && <span className="muted"> · {role.jobTitle}</span>}
                </List.Item>
              )}
            />
            <List
              size="small"
              header={<strong>Equipos</strong>}
              locale={{ emptyText: 'No pertenece a ningún equipo' }}
              dataSource={org.teams.filter((t) => access.data.teamIds.includes(t.id))}
              renderItem={(team) => (
                <List.Item>
                  {team.name} <span className="muted">· {unitPath(org.orgUnits, team.orgUnitId)}</span>
                </List.Item>
              )}
            />
          </Card>
          <Card size="small" title={`Áreas que cubre: ${covered.length} de ${activeUnits}`}>
            {covered.length ? <Tree key={personId} selectable={false} defaultExpandAll treeData={unitTree(covered)} /> : <Empty description="No cubre ningún área" />}
          </Card>
        </div>
      )}
    </Space>
  );
}
