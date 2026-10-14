import type { ImportAction, ImportCause, ImportItem, ImportResult, OrgUnit } from '@origo/capital-humano';
import { parseCsv } from '@origo/capital-humano';
import { Alert, App, Button, Table, Tag, Tooltip } from 'antd';
import { useMemo, useRef, useState } from 'react';
import type { ImportFile } from '../api';
import { CropSeal, StageSeal, cropsOf, type Crop, type Stage } from '../crops';
import { useImport } from '../hooks';
import { count, normalize } from '../lib';
import { READ_ONLY_HINT, type TabProps } from '../types';

const ACTION: Record<ImportAction, { label: string; color: string }> = {
  create: { label: 'Se crea', color: 'green' },
  change: { label: 'Cambia', color: 'blue' },
  unchanged: { label: 'Sin cambio', color: 'default' },
  error: { label: 'Con error', color: 'red' },
};
const TILES: { key: ImportAction; label: string }[] = [
  { key: 'create', label: 'Se crean' },
  { key: 'change', label: 'Cambian' },
  { key: 'unchanged', label: 'Sin cambio' },
  { key: 'error', label: 'Con error' },
];

type Sheet = ImportItem['sheet'];
// One slot per file, in the order the load needs them: an área before the equipos and people in it.
const SLOTS: { key: Sheet; title: string; order: string; file: string; word: string; columns: string; sample: string }[] = [
  { key: 'areas', title: 'Áreas', order: 'Se carga primero', file: 'areas.csv', word: 'area', columns: 'codigo, nombre, tipo, area_superior', sample: 'DIR-EJEMPLO,Dirección de Ejemplo,direccion,CODIGO-DE-LA-EMPRESA' },
  { key: 'roles', title: 'Roles', order: 'Segundo', file: 'roles.csv', word: 'rol', columns: 'codigo, nombre, nivel, descripcion', sample: 'supervisor,Supervisor,supervisor,Supervisa un equipo' },
  { key: 'equipos', title: 'Equipos', order: 'Tercero', file: 'equipos.csv', word: 'equipo', columns: 'area, codigo, nombre, lider', sample: 'DIR-EJEMPLO,EQUIPO-A,Equipo A,E-0001' },
  { key: 'personas', title: 'Personas', order: 'Al final', file: 'personas.csv', word: 'persona', columns: 'cuenta, numero_empleado, nombre, rol, area, puesto, equipo', sample: 'persona@ejemplo.test,E-0001,Persona de Ejemplo,supervisor,DIR-EJEMPLO,Supervisor de Ejemplo,EQUIPO-A' },
];
const SHEET_NAME = Object.fromEntries(SLOTS.map((slot) => [slot.key, slot.title])) as Record<Sheet, string>;
// The API recognises a CSV by these words in its name, in this order (parseImportFiles).
const sheetOf = (fileName: string): Sheet | null => SLOTS.find((slot) => normalize(fileName).includes(slot.word))?.key ?? null;

// How each kind of rejection reads, and what to do about it (spec M2-28).
const CAUSE: Record<ImportCause, { title: string; fix: string }> = {
  duplicate: { title: 'Código repetido en el archivo', fix: 'deja una sola fila con ese código.' },
  parentMissing: { title: 'No existe el área superior', fix: 'agrega esa área al archivo o corrige su código.' },
  parentFailed: { title: 'Su área superior no se pudo cargar', fix: 'corrige primero el área superior; esta fila entra después.' },
  areaMissing: { title: 'No existe el área', fix: 'carga esa área antes, o corrige su código.' },
  roleMissing: { title: 'No existe el rol', fix: 'usa un código del catálogo de roles, o agrégalo en el archivo de roles.' },
  teamMissing: { title: 'No existe el equipo', fix: 'agrégalo en el archivo de equipos, o corrige su código.' },
  identifierMissing: { title: 'Falta la cuenta o el número de empleado', fix: 'cada persona necesita al menos uno de los dos.' },
  leadMissing: { title: 'No existe la persona líder', fix: 'carga a esa persona, o corrige su identificador.' },
  leadNotMember: { title: 'El líder no es integrante del equipo', fix: 'agrega a esa persona al equipo en el archivo de personas.' },
  rule: { title: 'Lo impide una regla de la organización', fix: 'el detalle de cada fila dice cuál.' },
};
const SHOWN_PER_CAUSE = 4;

interface Picked {
  /** Name the person's file has. */
  original: string;
  /** What is sent: the same file, under a name the API recognises as this slot's. */
  file: ImportFile;
  rows: number;
}

const download = (name: string, text: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
};
// Codes and names come from the uploaded files: a leading = + - @ or control character is kept as text,
// so a spreadsheet opening the errors does not run it as a formula.
const csvCell = (value: string | number) => {
  const text = String(value);
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

interface Impact {
  /** Code of the branch, '' for what lands on the empresa. */
  key: string;
  /** The branch in the organization; '' when the file creates it. */
  id: string;
  name: string;
  crop: Crop | null;
  lines: string[];
  keys: string[];
}

/** What a load changes in each branch of the organization, from the rows that would be saved. */
function impactOf(units: OrgUnit[], items: ImportItem[]): Impact[] {
  const byCode = new Map(units.map((u) => [normalize(u.code), u]));
  const byId = new Map(units.map((u) => [u.id, u]));
  const crops = cropsOf(units);
  // The tree as it would be after the load: an área row that would be saved sets where it hangs,
  // whether the área is new or moves; every other área stays where it is.
  const saved = items.filter((i) => i.entity === 'orgUnit' && i.orgUnitCode && i.action !== 'error');
  const parentInFile = new Map(saved.map((i) => [normalize(i.orgUnitCode!), i.parentCode ? normalize(i.parentCode) : null]));
  const spelled = new Map(saved.map((i) => [normalize(i.orgUnitCode!), i.orgUnitCode!]));
  const parentOf = (code: string): string | null => {
    if (parentInFile.has(code)) return parentInFile.get(code)!;
    const parent = byId.get(byCode.get(code)?.parentId ?? '');
    return parent ? normalize(parent.code) : null;
  };
  // A branch hangs directly from the empresa, which hangs from nothing (as in `branchOf`).
  const branchOfCode = (code: string | null): string | null => {
    const seen = new Set<string>();
    let below: string | null = null;
    for (let current = code ? normalize(code) : null; current && !seen.has(current); current = parentOf(current)) {
      seen.add(current);
      if (parentOf(current) === null) return below;
      below = current;
    }
    return null;
  };

  const tally = new Map<string, { unit: OrgUnit | null; code: string; areas: [number, number]; teams: [number, number]; roles: [number, number]; records: [number, number]; people: Set<string>; keys: string[] }>();
  for (const item of items) {
    if (item.action !== 'create' && item.action !== 'change') continue;
    const code = branchOfCode(item.orgUnitCode) ?? '';
    const unit = byCode.get(code) ?? null;
    const row = tally.get(code) ?? { unit, code, areas: [0, 0], teams: [0, 0], roles: [0, 0], records: [0, 0], people: new Set<string>(), keys: [] };
    const slot = item.action === 'create' ? 0 : 1;
    if (item.entity === 'orgUnit') {
      row.areas[slot] += 1;
      row.keys.push(item.key);
    } else if (item.entity === 'team') row.teams[slot] += 1;
    else if (item.entity === 'role') row.roles[slot] += 1;
    else if (item.entity === 'person') row.records[slot] += 1;
    else if (item.personKey) row.people.add(item.personKey);
    tally.set(code, row);
  }
  const part = ([created, changed]: [number, number], one: string, many: string, verb: [string, string]) => [
    ...(created ? [`+${count(created, one, many)}`] : []),
    ...(changed ? [`${count(changed, one, many)} ${changed === 1 ? verb[0] : verb[1]}`] : []),
  ];
  return [...tally.values()]
    .map(({ unit, code, areas, teams, roles, records, people, keys }) => ({
      key: code,
      id: unit?.id ?? '',
      // A dirección the file creates has no crop yet: it gets one once it is in the organization.
      name: unit?.name ?? (code ? `Nueva dirección ${spelled.get(code) ?? code}` : 'Toda la organización'),
      crop: unit ? (crops.get(unit.id) ?? null) : null,
      lines: [
        ...part(areas, 'área', 'áreas', ['cambia', 'cambian']),
        ...part(teams, 'equipo', 'equipos', ['cambia', 'cambian']),
        ...part(roles, 'rol', 'roles', ['cambia', 'cambian']),
        ...part(records, 'persona', 'personas', ['cambia de datos', 'cambian de datos']),
        ...(people.size ? [`${count(people.size, 'persona', 'personas')} con rol o equipo nuevo`] : []),
      ],
      keys,
    }))
    .sort((a, b) => Number(!a.key) - Number(!b.key) || Number(!a.id) - Number(!b.id) || a.name.localeCompare(b.name, 'es'));
}

/** Spec M2-17 to M2-19 and M2-28: choose the files, see what they would change, confirm. */
export function ImportTab({ org, canEdit, onShowArea }: TabProps) {
  const { message } = App.useApp();
  const [picked, setPicked] = useState<Partial<Record<Sheet, Picked>>>({});
  const [whole, setWhole] = useState<ImportFile | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [only, setOnly] = useState<ImportAction | null>(null);
  const [showRows, setShowRows] = useState(false);
  const [over, setOver] = useState<Sheet | null>(null);
  const inputs = useRef<Partial<Record<Sheet, HTMLInputElement | null>>>({});
  const wholeInput = useRef<HTMLInputElement>(null);
  const load = useImport();

  const files: ImportFile[] = [...(whole ? [whole] : []), ...SLOTS.flatMap((slot) => (picked[slot.key] ? [picked[slot.key]!.file] : []))];
  // On screen a file keeps the name the person gave it.
  const names = [...(whole ? [whole.name] : []), ...SLOTS.flatMap((slot) => (picked[slot.key] ? [picked[slot.key]!.original] : []))];
  const step = !result ? 1 : result.mode === 'preview' ? 2 : 3;
  const stages: { stage: Stage; name: string; hint: string }[] = [
    { stage: 'semilla', name: '1 · Siembra', hint: 'Elige los archivos' },
    { stage: 'brote', name: '2 · Brote', hint: 'Revisa lo que va a pasar' },
    { stage: 'fruto', name: '3 · Cosecha', hint: 'Carga aplicada' },
  ];

  const forget = () => {
    setResult(null);
    setOnly(null);
    setShowRows(false);
  };
  // A file dropped on a slot belongs to it whatever its name; one chosen loosely goes by its name.
  const add = async (list: FileList | File[], into?: Sheet) => {
    for (const file of Array.from(list)) {
      const text = await file.text();
      if (normalize(file.name).endsWith('.json')) {
        setWhole({ name: file.name, text });
        continue;
      }
      const sheet = into ?? sheetOf(file.name);
      const slot = SLOTS.find((s) => s.key === sheet);
      if (!slot) {
        void message.warning(`No sé a qué casilla va «${file.name}». Suéltalo sobre Áreas, Roles, Equipos o Personas.`);
        continue;
      }
      const name = sheetOf(file.name) === slot.key ? file.name : slot.file;
      setPicked((current) => ({ ...current, [slot.key]: { original: file.name, file: { name, text }, rows: parseCsv(text).length } }));
    }
    forget();
  };
  const remove = (sheet: Sheet) => {
    setPicked(({ [sheet]: _gone, ...rest }) => rest);
    forget();
  };
  const reset = () => {
    setPicked({});
    setWhole(null);
    forget();
  };
  // Confirming sends back the id of the preview on screen: the API applies nothing else (M2-18).
  const run = (mode: 'preview' | 'apply') => load.mutate({ mode, files, previewId: mode === 'apply' ? result?.importRunId : undefined }, { onSuccess: setResult });

  const pending = result ? result.summary.create + result.summary.change : 0;
  const total = result?.items.length ?? 0;
  const impact = useMemo(() => (result ? impactOf(org.orgUnits, result.items) : []), [org.orgUnits, result]);
  const errors = useMemo(() => {
    const groups = new Map<ImportCause, ImportItem[]>();
    for (const item of result?.items ?? []) if (item.action === 'error') groups.set(item.cause ?? 'rule', [...(groups.get(item.cause ?? 'rule') ?? []), item]);
    return [...groups].sort((a, b) => b[1].length - a[1].length);
  }, [result]);
  const rows = useMemo(() => (result?.items ?? []).filter((item) => !only || item.action === only).sort((a, b) => Number(b.action === 'error') - Number(a.action === 'error')), [result, only]);
  const downloadErrors = () =>
    download('filas-con-error.csv', ['hoja,fila,registro,detalle', ...(result?.items ?? []).filter((i) => i.action === 'error').map((i) => [SHEET_NAME[i.sheet], i.row, i.key, i.message ?? ''].map(csvCell).join(','))].join('\n'));

  return (
    <div className="load">
      <ol className="load-steps">
        {stages.map(({ stage, name, hint }, index) => (
          <li key={stage} className={index + 1 === step ? 'is-current' : index + 1 < step ? 'is-done' : undefined} aria-current={index + 1 === step ? 'step' : undefined}>
            <StageSeal stage={stage} />
            <span>
              <strong>{name}</strong>
              <span>{hint}</span>
            </span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <>
          <div className="load-slots">
            {SLOTS.map((slot) => {
              const mine = picked[slot.key];
              return (
                <section
                  key={slot.key}
                  className={`load-slot ${mine ? 'is-ready' : ''} ${over === slot.key ? 'is-over' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOver(slot.key);
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setOver(null);
                    void add(event.dataTransfer.files, slot.key);
                  }}
                >
                  <div className="load-slot-top">
                    <span className="org-kind">{slot.order}</span>
                    <Tag color={mine ? 'success' : undefined}>{mine ? 'Listo' : 'Opcional'}</Tag>
                  </div>
                  <h3>{slot.title}</h3>
                  {mine ? <p className="mono">{mine.original} · {count(mine.rows, 'fila', 'filas')}</p> : <p className="muted">Arrastra aquí {slot.file}</p>}
                  <p className="load-columns">{slot.columns}</p>
                  <div className="load-slot-actions">
                    <input
                      ref={(element) => {
                        inputs.current[slot.key] = element;
                      }}
                      type="file"
                      accept=".csv"
                      hidden
                      aria-label={`Archivo de ${slot.title}`}
                      onChange={(event) => {
                        if (event.target.files?.length) void add(event.target.files, slot.key);
                        event.target.value = '';
                      }}
                    />
                    <Button onClick={() => inputs.current[slot.key]?.click()}>{mine ? 'Cambiar' : 'Elegir archivo'}</Button>
                    {mine ? (
                      <Button onClick={() => remove(slot.key)}>Quitar</Button>
                    ) : (
                      <Button type="link" onClick={() => download(slot.file, `${slot.columns.replace(/, /g, ',')}\n${slot.sample}\n`)}>
                        Descargar plantilla
                      </Button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          {whole && (
            <Alert
              type="info"
              showIcon
              message={`${whole.name}: un archivo .json trae toda la carga en un solo archivo.`}
              action={
                <Button size="small" onClick={() => { setWhole(null); forget(); }}>
                  Quitar
                </Button>
              }
            />
          )}
          <div className="load-footer">
            <Button type="primary" size="large" disabled={!files.length} loading={load.isPending} onClick={() => run('preview')}>
              {files.length ? `Revisar ${count(files.length, 'archivo', 'archivos')}` : 'Revisar antes de cargar'}
            </Button>
            <Button size="large" disabled={!files.length} onClick={reset}>
              Limpiar
            </Button>
            <input ref={wholeInput} type="file" accept=".json" hidden aria-label="Archivo .json con toda la carga" onChange={(event) => { if (event.target.files?.length) void add(event.target.files); event.target.value = ''; }} />
            <Button type="link" size="large" onClick={() => wholeInput.current?.click()}>
              o elige un .json con toda la carga
            </Button>
            <p className="muted">La carga crea y cambia; nunca desactiva lo que no viene en el archivo. Nada se guarda hasta que confirmes en el paso 2.</p>
          </div>
        </>
      )}

      {result && (
        <>
          <div className="load-head">
            <h3>{step === 2 ? 'Qué va a pasar si confirmas' : 'Carga aplicada'}</h3>
            <span className="fresh">
              {names.join(' · ')} · {count(total, 'fila', 'filas')}
            </span>
          </div>
          {step === 3 && <Alert type="success" showIcon message={`Se guardaron ${count(pending, 'registro', 'registros')}.`} />}
          <div className="trays">
            {TILES.map(({ key, label }) => (
              <button key={key} type="button" className={`tray load-tile is-${key}`} aria-pressed={only === key} onClick={() => { setOnly(only === key ? null : key); setShowRows(true); }}>
                <span className="tray-count">{result.summary[key]}</span>
                <span className="tray-label">{label}</span>
              </button>
            ))}
          </div>
          {total > 0 && (
            <div className="load-bar" role="img" aria-label={`De ${count(total, 'fila', 'filas')}: ${TILES.map(({ key, label }) => `${result.summary[key]} ${label.toLowerCase()}`).join(', ')}`}>
              {TILES.filter(({ key }) => result.summary[key] > 0).map(({ key }) => (
                <span key={key} className={`is-${key}`} style={{ flexGrow: result.summary[key] }} />
              ))}
            </div>
          )}

          <div className="load-panels">
            <section className="ficha-section">
              <span className="eyebrow">Impacto por dirección</span>
              {impact.length ? (
                impact.map((branch) => (
                  <div key={branch.key || 'all'} className="load-impact" data-crop={branch.crop ?? undefined}>
                    <CropSeal crop={branch.crop ?? 'brote'} size={44} />
                    <div>
                      <strong>{branch.name}</strong>
                      <span className="load-impact-lines">{branch.lines.join(' · ')}</span>
                      {branch.keys.length > 0 && <span className="muted">Áreas: {branch.keys.slice(0, 4).join(', ')}{branch.keys.length > 4 ? ` y ${branch.keys.length - 4} más` : ''}</span>}
                    </div>
                    {branch.id && <Button onClick={() => onShowArea(branch.id)}>Ver en el organigrama</Button>}
                  </div>
                ))
              ) : (
                <p className="muted">Nada cambia: la organización ya está igual que el archivo.</p>
              )}
            </section>
            <section className="ficha-section">
              <span className="eyebrow load-errors-title">Errores por causa · no se cargan</span>
              {errors.length ? (
                <>
                  {errors.map(([cause, list]) => (
                    <div key={cause} className="load-cause">
                      <div className="load-cause-top">
                        <strong>{CAUSE[cause].title}</strong>
                        <span className="fresh">{count(list.length, 'fila', 'filas')}</span>
                      </div>
                      <ul className="ficha-list">
                        {list.slice(0, SHOWN_PER_CAUSE).map((item) => (
                          <li key={`${item.sheet}-${item.row}-${item.key}`}>
                            <span className="fresh">{SHEET_NAME[item.sheet]} · fila {item.row}</span> · {item.key}
                            {cause === 'rule' && item.message && <div className="muted">{item.message}</div>}
                          </li>
                        ))}
                        {list.length > SHOWN_PER_CAUSE && <li className="muted">y {list.length - SHOWN_PER_CAUSE} más</li>}
                      </ul>
                      <p className="load-fix">Cómo corregirlo: {CAUSE[cause].fix}</p>
                    </div>
                  ))}
                  <Button className="load-download" onClick={downloadErrors}>Descargar las {count(result.summary.error, 'fila', 'filas')} con error</Button>
                </>
              ) : (
                <p className="muted">Ninguna fila tiene error.</p>
              )}
            </section>
          </div>

          <div className="load-footer">
            {step === 2 &&
              (pending === 0 ? (
                <Alert type="info" showIcon message="No hay nada que cargar: la organización ya está igual que el archivo." />
              ) : (
                <Tooltip title={canEdit ? undefined : READ_ONLY_HINT}>
                  <Button type="primary" size="large" disabled={!canEdit} loading={load.isPending} onClick={() => run('apply')}>
                    Confirmar carga de {count(pending, 'registro', 'registros')}
                  </Button>
                </Tooltip>
              ))}
            {step === 2 && (
              <Button size="large" onClick={forget}>
                Cambiar archivos
              </Button>
            )}
            {step === 3 && (
              <Button type="primary" size="large" onClick={reset}>
                Nueva carga
              </Button>
            )}
            <Button size="large" onClick={() => setShowRows(!showRows)}>
              {showRows ? 'Ocultar las filas' : `Ver las ${count(total, 'fila', 'filas')}`}
            </Button>
            {step === 2 && result.summary.error > 0 && <p className="muted">Las filas con error se quedan fuera. Corrígelas y vuelve a cargar: lo ya cargado no se duplica.</p>}
          </div>

          {showRows && (
            <Table<ImportItem>
              size="small"
              rowKey={(item) => `${item.sheet}-${item.row}-${item.key}`}
              dataSource={rows}
              pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (shown) => (only ? `${shown} de ${count(total, 'fila', 'filas')}` : count(shown, 'fila', 'filas')) }}
              columns={[
                { title: 'Hoja', render: (_, item) => SHEET_NAME[item.sheet], filters: SLOTS.map((slot) => ({ value: slot.key, text: slot.title })), onFilter: (value, item) => item.sheet === value },
                { title: 'Fila', dataIndex: 'row', align: 'right' },
                { title: 'Registro', dataIndex: 'key' },
                { title: 'Resultado', render: (_, item) => <Tag color={ACTION[item.action].color}>{ACTION[item.action].label}</Tag> },
                { title: 'Detalle', dataIndex: 'message' },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
