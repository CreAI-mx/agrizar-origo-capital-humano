import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { VersionRow } from '../../domain/models';
import { MemoryOrganizationRepository } from './memoryRepository';

/**
 * Append-only JSON-lines file: one version row per line, never rewritten. For local runs by
 * one process only (ADR-0001); a shared environment needs a real store behind the same port.
 */
export class FileOrganizationRepository extends MemoryOrganizationRepository {
  private constructor(
    private readonly path: string,
    rows: VersionRow[],
  ) {
    super(rows);
  }

  static async open(path: string): Promise<FileOrganizationRepository> {
    await mkdir(dirname(path), { recursive: true });
    const text = await readFile(path, 'utf8').catch(() => '');
    const rows = text
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as VersionRow);
    return new FileOrganizationRepository(path, rows);
  }

  protected override async persist(rows: VersionRow[]): Promise<void> {
    if (rows.length) await appendFile(this.path, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  }
}
