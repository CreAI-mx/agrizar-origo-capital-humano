import { ADMIN_ROLE_CODE } from '@origo/capital-humano';
import { App as AntApp, ConfigProvider, Layout, Result, Segmented, Select, Spin, Tag } from 'antd';
import esES from 'antd/locale/es_ES';
import { useEffect, useState } from 'react';
import { OrganizationPage } from './features/organizacion';
import { setCurrentUser } from './features/organizacion/api';
import { useAccess, useOrganization } from './features/organizacion/hooks';
import { formatDateTime } from './features/organizacion/lib';
import { agrizarDark, agrizarLight } from './theme';

type Mode = 'dark' | 'light';
// The shareable demo (vite.demo.config.ts) runs without a server on invented data.
const IS_DEMO = import.meta.env.MODE === 'demo';
const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice just does not persist */
  }
};

export function App() {
  const [mode, setMode] = useState<Mode>(() => (stored('origo-theme') === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    remember('origo-theme', mode);
  }, [mode]);

  return (
    <ConfigProvider locale={esES} theme={mode === 'dark' ? agrizarDark : agrizarLight}>
      <AntApp>
        <Shell mode={mode} onMode={setMode} />
      </AntApp>
    </ConfigProvider>
  );
}

function Shell({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  const organization = useOrganization();
  const org = organization.data;
  const [chosen, setChosen] = useState<string | null>(() => stored('origo-user'));

  // Local DEV has no sign-in: the session starts as the first Administrador de Origo.
  const adminRoleId = org?.roles.find((r) => r.code === ADMIN_ROLE_CODE)?.id;
  const firstAdmin = org?.roleAssignments.find((a) => a.roleId === adminRoleId && a.status === 'active')?.personId;
  const userId = org?.people.some((p) => p.id === chosen && p.status === 'active') ? chosen! : (firstAdmin ?? '');
  setCurrentUser(userId);
  const access = useAccess(userId || undefined);

  if (organization.isLoading) return <Spin fullscreen tip="Cargando la organización" />;
  if (!org) {
    return <Result status="warning" title="No hay conexión con la API local" subTitle="Enciéndela con «npm run dev» en la raíz del repositorio y vuelve a cargar la página." />;
  }
  return (
    <Layout style={{ minHeight: '100%' }}>
      <Layout.Header className="app-header" style={{ background: 'transparent' }}>
        <div>
          <span className="eyebrow">Origo · Capital Humano</span>
          <h1>Árbol de organización</h1>
          <span className="fresh">
            {org.dataAsOf ? `Dato de: ${formatDateTime(org.dataAsOf)} · ${org.lastChangedBy === 'seed' ? 'carga inicial' : org.lastChangedBy}` : 'Sin datos todavía'}
          </span>
        </div>
        <Tag color="gold">{IS_DEMO ? 'Demo · datos inventados · nada se guarda' : 'DEV local · datos de demostración'}</Tag>
        <span className="spacer" />
        <label htmlFor="session-user">Sesión como</label>
        <Select
          id="session-user"
          showSearch
          style={{ width: 260 }}
          optionFilterProp="label"
          value={userId || undefined}
          onChange={(value) => {
            setChosen(value);
            remember('origo-user', value);
          }}
          options={org.people.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.displayName }))}
        />
        <Tag color={access.data?.isAdmin ? 'green' : 'default'}>{access.data?.isAdmin ? 'Administrador de Origo' : 'Solo lectura'}</Tag>
        <Segmented<Mode> value={mode} onChange={onMode} options={[{ value: 'dark', label: 'Oscuro' }, { value: 'light', label: 'Claro' }]} />
      </Layout.Header>
      <Layout.Content className="app-content">
        <OrganizationPage org={org} canEdit={Boolean(access.data?.isAdmin)} mode={mode} />
      </Layout.Content>
    </Layout>
  );
}
