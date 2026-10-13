import { DomainError } from '../../domain/errors';
import { normalize } from '../../domain/rules';

export interface ImportFile {
  name: string;
  text: string;
}

/** Minimal CSV reader: quoted fields, doubled quotes, `,` or `;` as separator, BOM, CRLF. */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.slice(0, clean.search(/\r?\n|$/));
  const separator = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]!;
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);

  const [header, ...body] = rows.filter((cells) => cells.some((cell) => cell.trim()));
  if (!header) return [];
  const keys = header.map((cell) => normalize(cell).replace(/\s+/g, '_'));
  return body.map((cells) => Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? '').trim()])));
}

/**
 * Turns the uploaded files into one load. Accepts a single JSON file in the load format, or
 * CSV files recognised by name: áreas, roles, equipos, personas (spec M2-17).
 *
 * CSV columns —
 *   áreas:    codigo, nombre, tipo, area_superior
 *   roles:    codigo, nombre, nivel, descripcion
 *   equipos:  area, codigo, nombre, lider
 *   personas: cuenta, numero_empleado, nombre, rol, area, puesto, equipo  (one row per assignment)
 */
export function parseImportFiles(files: ImportFile[]): unknown {
  const payload: Record<string, unknown[]> = { orgUnits: [], roles: [], teams: [], people: [] };
  for (const file of files) {
    const name = normalize(file.name);
    if (name.endsWith('.json')) {
      try {
        Object.assign(payload, JSON.parse(file.text));
      } catch {
        throw new DomainError('BAD_FILE', `El archivo ${file.name} no es un JSON válido.`);
      }
      continue;
    }
    const rows = parseCsv(file.text);
    if (name.includes('area')) {
      payload.orgUnits = rows.map((r) => ({ code: r.codigo, name: r.nombre, kind: normalize(r.tipo ?? ''), parentCode: r.area_superior }));
    } else if (name.includes('rol')) {
      payload.roles = rows.map((r) => ({ code: r.codigo, name: r.nombre, level: normalize(r.nivel ?? '') || null, description: r.descripcion }));
    } else if (name.includes('equipo')) {
      payload.teams = rows.map((r) => ({ orgUnitCode: r.area, code: r.codigo, name: r.nombre, leadKey: r.lider }));
    } else if (name.includes('persona')) {
      // One person can take several rows, one per role or equipo. Each piece keeps the row it
      // came from, so the preview reports a problem on the row that has it (spec M2-18).
      const people = new Map<string, { row: number; displayName: string; account: string | null; employeeNumber: string | null; assignments: unknown[]; teams: unknown[] }>();
      rows.forEach((r, index) => {
        const row = index + 1;
        const key = r.cuenta || r.numero_empleado || r.nombre || '';
        const person = people.get(key) ?? { row, displayName: r.nombre ?? '', account: r.cuenta || null, employeeNumber: r.numero_empleado || null, assignments: [], teams: [] };
        if (r.rol && r.area) person.assignments.push({ row, roleCode: r.rol, orgUnitCode: r.area, jobTitle: r.puesto });
        if (r.equipo && r.area) person.teams.push({ row, orgUnitCode: r.area, teamCode: r.equipo });
        people.set(key, person);
      });
      payload.people = [...people.values()];
    } else {
      throw new DomainError('BAD_FILE', `No reconozco el archivo ${file.name}. Usa áreas, roles, equipos o personas en el nombre, o un .json.`);
    }
  }
  return payload;
}
