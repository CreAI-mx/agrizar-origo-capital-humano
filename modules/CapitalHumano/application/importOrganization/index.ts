import { z } from 'zod';
import { DomainError } from '../../domain/errors';
import { importPayloadSchema, planImport, type ImportItem, type ImportPlan } from '../../domain/importPlan';
import type { Actor, Deps } from '../ports';
import { assertAdmin, toVersionRows } from '../shared';
import { parseImportFiles } from './parseFiles';

export const importOrganizationInput = z.object({
  mode: z.enum(['preview', 'apply']),
  files: z.array(z.object({ name: z.string().min(1), text: z.string() })).min(1),
});
export type ImportOrganizationInput = z.infer<typeof importOrganizationInput>;

export interface ImportResult {
  importRunId: string;
  mode: 'preview' | 'apply';
  summary: ImportPlan['summary'];
  items: ImportItem[];
  dataAsOf: string | null;
}

/**
 * Bulk load (spec M2-17 to M2-19). `preview` writes nothing; `apply` saves every row that
 * passed and skips the rejected ones. Rows equal to the current version produce no row, so
 * loading the same file twice changes nothing. Every run is logged.
 */
export async function importOrganization(input: ImportOrganizationInput, actor: Actor, deps: Deps): Promise<ImportResult> {
  const { mode, files } = importOrganizationInput.parse(input);
  const parsed = importPayloadSchema.safeParse(parseImportFiles(files));
  if (!parsed.success) {
    throw new DomainError(
      'BAD_FILE',
      'El archivo no tiene el formato de carga.',
      parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const { state, currentRowIds, dataAsOf } = await deps.repo.load();
  if (mode === 'apply') assertAdmin(state, actor);

  const plan = planImport(state, parsed.data, deps.newId);
  const importRunId = deps.newId();
  const run = {
    id: importRunId,
    mode,
    fileNames: files.map((file) => file.name),
    summary: plan.summary,
    errors: plan.items.filter((item) => item.action === 'error'),
  };
  const source = `import:${importRunId}`;
  const rows = [
    ...(mode === 'apply' ? toVersionRows(plan.changes, currentRowIds, actor, source, deps) : []),
    ...toVersionRows([{ kind: 'importRun', entity: run }], currentRowIds, actor, source, deps),
  ];
  await deps.repo.append(rows);

  const changed = mode === 'apply' && plan.changes.length > 0;
  return { importRunId, mode, summary: plan.summary, items: plan.items, dataAsOf: changed ? rows[0]!.recordedAt : dataAsOf };
}
