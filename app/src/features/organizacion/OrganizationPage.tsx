import type { OrganizationView } from '@origo/capital-humano';
import { Tabs, TreeSelect } from 'antd';
import { useMemo, useState } from 'react';
import { AreasTab } from './components/AreasTab';
import { HistoryDrawer } from './components/HistoryDrawer';
import { ImportTab } from './components/ImportTab';
import { PeopleTab } from './components/PeopleTab';
import { RolesTab } from './components/RolesTab';
import { TeamsTab } from './components/TeamsTab';
import { ViewAsTab } from './components/ViewAsTab';
import { peopleInScope, scopeOf, unitPath, unitTree } from './lib';
import type { TabProps } from './types';

/** MD-2 Árbol de organización (GRZR-31): maintenance, bulk load and "Ver como". */
export function OrganizationPage({ org, canEdit, mode }: { org: OrganizationView; canEdit: boolean; mode: 'dark' | 'light' }) {
  const [history, setHistory] = useState<{ entityId: string; title: string } | null>(null);
  // The área filter lives here so it carries from one tab to the next (spec M2-24).
  const [scopeId, setScopeId] = useState<string | null>(null);
  const scopeUnit = org.orgUnits.find((u) => u.id === scopeId) ?? null;
  const scope = useMemo(() => (scopeUnit ? scopeOf(org.orgUnits, scopeUnit.id) : null), [org.orgUnits, scopeUnit]);
  const scopePeople = useMemo(() => (scope ? peopleInScope(org, scope) : null), [org, scope]);
  const props: TabProps = { org, canEdit, mode, scope, onScope: setScopeId, onHistory: (entityId, title) => setHistory({ entityId, title }) };

  const active = <T extends { status: string }>(items: T[]) => items.filter((item) => item.status === 'active');
  const counts = {
    areas: active(org.orgUnits).filter((u) => !scope || scope.has(u.id)).length,
    roles: active(org.roles).length,
    teams: active(org.teams).filter((t) => !scope || scope.has(t.orgUnitId)).length,
    people: active(org.people).filter((p) => !scopePeople || scopePeople.has(p.id)).length,
  };
  const options = useMemo(() => unitTree(active(org.orgUnits)), [org.orgUnits]);

  return (
    <>
      <div className="scope-bar">
        <label htmlFor="scope-area">Área o departamento</label>
        <TreeSelect
          id="scope-area"
          className="scope-select"
          allowClear
          showSearch
          treeNodeFilterProp="title"
          treeDefaultExpandedKeys={options.map((node) => node.key)}
          placeholder="Toda la organización"
          value={scopeUnit?.id}
          onChange={(value) => setScopeId(value ?? null)}
          treeData={options}
        />
        {scopeUnit && <span className="muted">{unitPath(org.orgUnits, scopeUnit.id)} · incluye lo que tiene debajo</span>}
      </div>
      <Tabs
        destroyOnHidden
        items={[
          { key: 'areas', label: `Áreas (${counts.areas})`, children: <AreasTab {...props} /> },
          { key: 'roles', label: `Roles (${counts.roles})`, children: <RolesTab {...props} /> },
          { key: 'equipos', label: `Equipos (${counts.teams})`, children: <TeamsTab {...props} /> },
          { key: 'personas', label: `Personas (${counts.people})`, children: <PeopleTab {...props} /> },
          { key: 'carga', label: 'Carga', children: <ImportTab {...props} /> },
          { key: 'ver-como', label: 'Ver como', children: <ViewAsTab {...props} /> },
        ]}
      />
      <HistoryDrawer org={org} target={history} onClose={() => setHistory(null)} />
    </>
  );
}
