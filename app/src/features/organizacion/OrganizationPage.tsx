import type { OrganizationView } from '@origo/capital-humano';
import { Tabs } from 'antd';
import { useState } from 'react';
import { AreasTab } from './components/AreasTab';
import { HistoryDrawer } from './components/HistoryDrawer';
import { ImportTab } from './components/ImportTab';
import { PeopleTab } from './components/PeopleTab';
import { RolesTab } from './components/RolesTab';
import { TeamsTab } from './components/TeamsTab';
import { ViewAsTab } from './components/ViewAsTab';
import type { TabProps } from './types';

/** MD-2 Árbol de organización (GRZR-31): maintenance, bulk load and "Ver como". */
export function OrganizationPage({ org, canEdit }: { org: OrganizationView; canEdit: boolean }) {
  const [history, setHistory] = useState<{ entityId: string; title: string } | null>(null);
  const props: TabProps = { org, canEdit, onHistory: (entityId, title) => setHistory({ entityId, title }) };
  const active = <T extends { status: string }>(items: T[]) => items.filter((item) => item.status === 'active').length;

  return (
    <>
      <Tabs
        destroyOnHidden
        items={[
          { key: 'areas', label: `Áreas (${active(org.orgUnits)})`, children: <AreasTab {...props} /> },
          { key: 'roles', label: `Roles (${active(org.roles)})`, children: <RolesTab {...props} /> },
          { key: 'equipos', label: `Equipos (${active(org.teams)})`, children: <TeamsTab {...props} /> },
          { key: 'personas', label: `Personas (${active(org.people)})`, children: <PeopleTab {...props} /> },
          { key: 'carga', label: 'Carga', children: <ImportTab {...props} /> },
          { key: 'ver-como', label: 'Ver como', children: <ViewAsTab {...props} /> },
        ]}
      />
      <HistoryDrawer org={org} target={history} onClose={() => setHistory(null)} />
    </>
  );
}
