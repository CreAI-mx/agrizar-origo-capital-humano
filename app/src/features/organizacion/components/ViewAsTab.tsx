import { Alert, Card, List, Select, Space, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { areaItems } from '../chartItems';
import { useAccess } from '../hooks';
import { count, unitPath } from '../lib';
import type { TabProps } from '../types';
import { TreeChart } from './TreeChart';

/**
 * Spec M2-22: what a given person's roles cover, drawn on the organization itself. Covered
 * áreas stay lit, the rest fade; the área where a role was given carries that role's name.
 */
export function ViewAsTab({ org, mode }: TabProps) {
  const [personId, setPersonId] = useState<string>();
  const access = useAccess(personId);
  const units = useMemo(() => org.orgUnits.filter((u) => u.status === 'active'), [org.orgUnits]);
  const context = personId ? access.data : undefined;

  const items = useMemo(() => {
    const base = areaItems(org, units);
    if (!context) return base;
    const covered = new Set(context.orgUnitIds);
    // For a covered área, the role that covers it is the one given on it or on its nearest ancestor.
    const reason = (id: string) => {
      for (let unit = units.find((u) => u.id === id); unit; unit = units.find((u) => u.id === unit!.parentId)) {
        const role = context.roles.find((r) => r.orgUnitId === unit!.id);
        if (role) return { role, direct: unit.id === id };
      }
      return null;
    };
    return base.map((item) => {
      const why = covered.has(item.id) ? reason(item.id) : null;
      return {
        ...item,
        selectable: false,
        lit: covered.has(item.id),
        dim: !covered.has(item.id),
        tag: why?.direct ? why.role.name : null,
        line2: why ? (why.direct ? 'Rol asignado aquí' : `Por ${why.role.name} en ${why.role.orgUnitName}`) : 'Fuera de su alcance',
      };
    });
  }, [org, units, context]);

  return (
    <div>
      <div className="toolbar">
        <Select
          showSearch
          allowClear
          className="grow"
          style={{ maxWidth: 460 }}
          placeholder="Elige una persona para ver qué cubre"
          optionFilterProp="label"
          value={personId}
          onChange={setPersonId}
          options={org.people.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.displayName }))}
        />
        {context && (
          <span className="chart-hint">
            Cubre {context.orgUnitIds.length} de {count(units.length, 'área', 'áreas')}
          </span>
        )}
      </div>
      <div className="chart-stage">
        <TreeChart key={personId ?? 'nobody'} items={items} mode={mode} frameIds={context?.orgUnitIds} emptyText="Aún no hay áreas" />
        {!personId && <span className="chart-hint chart-hint-center">Elige una persona: las áreas que cubren sus roles se iluminan y el resto se atenúa</span>}
        {context && (
          <Card size="small" className="chart-detail is-left" title="Roles y equipos">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {context.isAdmin && <Alert type="warning" showIcon message="Es Administrador de Origo: puede cambiar la organización." />}
              <List
                size="small"
                header={<strong>Roles</strong>}
                locale={{ emptyText: 'No tiene roles: no cubre ningún área' }}
                dataSource={context.roles}
                renderItem={(role) => (
                  <List.Item>
                    <span>
                      <Tag>{role.name}</Tag> en {role.orgUnitName}
                      {role.jobTitle && <span className="muted"> · {role.jobTitle}</span>}
                    </span>
                  </List.Item>
                )}
              />
              <List
                size="small"
                header={<strong>Equipos</strong>}
                locale={{ emptyText: 'No pertenece a ningún equipo' }}
                dataSource={org.teams.filter((t) => context.teamIds.includes(t.id))}
                renderItem={(team) => (
                  <List.Item>
                    <span>
                      {team.name} <span className="muted">· {unitPath(org.orgUnits, team.orgUnitId)}</span>
                    </span>
                  </List.Item>
                )}
              />
            </Space>
          </Card>
        )}
      </div>
    </div>
  );
}
