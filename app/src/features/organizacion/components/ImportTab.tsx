import type { ImportItem, ImportResult } from '@origo/capital-humano';
import { Alert, Button, Card, Space, Statistic, Table, Tag, Tooltip, Typography, Upload } from 'antd';
import { useState } from 'react';
import type { ImportFile } from '../api';
import { useImport } from '../hooks';
import { READ_ONLY_HINT, type TabProps } from '../types';

const ACTION: Record<ImportItem['action'], { label: string; color: string }> = {
  create: { label: 'Se crea', color: 'green' },
  change: { label: 'Cambia', color: 'blue' },
  unchanged: { label: 'Sin cambio', color: 'default' },
  error: { label: 'Con error', color: 'red' },
};
const SHEET: Record<ImportItem['sheet'], string> = { areas: 'Áreas', roles: 'Roles', equipos: 'Equipos', personas: 'Personas' };

export function ImportTab({ canEdit }: TabProps) {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const load = useImport();

  const run = (mode: 'preview' | 'apply') => load.mutate({ mode, files }, { onSuccess: setResult });
  const reset = () => {
    setFiles([]);
    setResult(null);
  };
  const pending = result ? result.summary.create + result.summary.change : 0;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small" title="1 · Elige los archivos">
        <Upload.Dragger
          multiple
          accept=".csv,.json"
          fileList={files.map((file) => ({ uid: file.name, name: file.name, status: 'done' as const }))}
          beforeUpload={async (file) => {
            const text = await file.text();
            setFiles((list) => [...list.filter((f) => f.name !== file.name), { name: file.name, text }]);
            setResult(null);
            return false;
          }}
          onRemove={(file) => {
            setFiles((list) => list.filter((f) => f.name !== file.name));
            setResult(null);
          }}
        >
          <p>Arrastra aquí los archivos o haz clic para elegirlos</p>
          <p className="muted">CSV con «áreas», «roles», «equipos» o «personas» en el nombre, o un .json en el formato de carga</p>
        </Upload.Dragger>
        <Typography.Paragraph className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          Columnas — áreas: codigo, nombre, tipo, area_superior · roles: codigo, nombre, nivel, descripcion · equipos: area, codigo, nombre, lider · personas: cuenta,
          numero_empleado, nombre, rol, area, puesto, equipo (una fila por rol). La carga crea y cambia; nunca desactiva lo que no viene en el archivo.
        </Typography.Paragraph>
        <Space style={{ marginTop: 12 }}>
          <Button type="primary" disabled={!files.length} loading={load.isPending && !result} onClick={() => run('preview')}>
            Revisar antes de cargar
          </Button>
          <Button disabled={!files.length && !result} onClick={reset}>
            Limpiar
          </Button>
        </Space>
      </Card>

      {result && (
        <Card size="small" title={result.mode === 'preview' ? '2 · Revisa lo que va a pasar' : 'Carga aplicada'}>
          <Space size="large" wrap>
            <Statistic title="Se crean" value={result.summary.create} />
            <Statistic title="Cambian" value={result.summary.change} />
            <Statistic title="Sin cambio" value={result.summary.unchanged} />
            <Statistic title="Con error" value={result.summary.error} valueStyle={result.summary.error ? { color: 'var(--malo)' } : undefined} />
          </Space>
          {result.mode === 'preview' ? (
            <div style={{ margin: '16px 0' }}>
              {pending === 0 ? (
                <Alert type="info" showIcon message="No hay nada que cargar: la organización ya está igual que el archivo." />
              ) : (
                <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
                  <Button type="primary" disabled={!canEdit} loading={load.isPending} onClick={() => run('apply')}>
                    Confirmar carga de {pending} registros
                  </Button>
                </Tooltip>
              )}
              {result.summary.error > 0 && <p className="muted">Las filas con error no se cargan. Corrígelas en el archivo y vuelve a cargarlo: lo ya cargado no se duplica.</p>}
            </div>
          ) : (
            <Alert style={{ margin: '16px 0' }} type="success" showIcon message={`Se guardaron ${pending} registros.`} />
          )}
          <Table<ImportItem>
            size="small"
            rowKey={(item) => `${item.sheet}-${item.row}-${item.key}`}
            dataSource={[...result.items].sort((a, b) => Number(b.action === 'error') - Number(a.action === 'error'))}
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `${total} filas` }}
            columns={[
              { title: 'Hoja', render: (_, item) => SHEET[item.sheet], filters: Object.entries(SHEET).map(([value, text]) => ({ value, text })), onFilter: (value, item) => item.sheet === value },
              { title: 'Fila', dataIndex: 'row', align: 'right' },
              { title: 'Registro', dataIndex: 'key' },
              {
                title: 'Resultado',
                render: (_, item) => <Tag color={ACTION[item.action].color}>{ACTION[item.action].label}</Tag>,
                filters: Object.entries(ACTION).map(([value, { label }]) => ({ value, text: label })),
                onFilter: (value, item) => item.action === value,
              },
              { title: 'Detalle', dataIndex: 'message' },
            ]}
          />
        </Card>
      )}
    </Space>
  );
}
