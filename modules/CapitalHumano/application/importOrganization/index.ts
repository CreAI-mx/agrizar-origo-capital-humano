import { z } from 'zod';
import { DomainError } from '../../domain/errors';
import { importPayloadSchema, planImport, type ImportItem, type ImportPlan } from '../../domain/importPlan';
import type { Actor, Deps } from '../ports';
import { assertAdmin, contentHash, toVersionRows } from '../shared';
import { parseImportFiles } from './parseFiles';

export const importOrganizationInput = z.object({
  mode: z.enum(['preview', 'apply']),
  files: z.array(z.object({ name: z.string().min(1), text: z.string() })).min(1),
  /** `importRunId` of the preview being confirmed. Required to apply, except for the seed. */
  previewId: z.string().min(1).optional(),
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
 *
 * M2-18: `apply` confirms a preview. It needs the id of a preview that the same person ran on
 * these exact files, with the organization unchanged since. Only the seed applies directly.
 */
export async function importOrganization(input: ImportOrganizationInput, actor: Actor, deps: Deps): Promise<ImportResult> {
  const { mode, files, previewId } = importOrganizationInput.parse(input);
  const parsed = importPayloadSchema.safeParse(parseImportFiles(files));
  if (!parsed.success) {
    throw new DomainError(
      'BAD_FILE',
      'El archivo no tiene el formato de carga.',
      parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const { state, currentRowIds, dataAsOf } = await deps.repo.load();
  const fileHash = contentHash(JSON.stringify(files));
  if (mode === 'apply') {
    assertAdmin(state, actor);
    if (!actor.system) {
      const receipt = previewId ? (await deps.repo.history(previewId)).find((row) => row.kind === 'importRun') : undefined;
      const preview = receipt?.data as { mode?: string; fileHash?: string; basedOn?: string | null } | undefined;
      if (!receipt || preview?.mode !== 'preview' || preview.fileHash !== fileHash || receipt.actorId !== actor.personId) {
        throw new DomainError('PREVIEW_REQUIRED', 'Revisa la carga antes de confirmarla: estos archivos no se han revisado.');
      }
      if ((preview.basedOn ?? null) !== dataAsOf) {
        throw new DomainError('PREVIEW_STALE', 'La organización cambió después de la revisión. Vuelve a revisar los archivos antes de cargarlos.');
      }
    }
  }

  const plan = planImport(state, parsed.data, deps.newId);
  const importRunId = deps.newId();
  const run = {
    id: importRunId,
    mode,
    fileNames: files.map((file) => file.name),
    fileHash,
    basedOn: dataAsOf,
    isTestData: parsed.data.isTestData,
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
