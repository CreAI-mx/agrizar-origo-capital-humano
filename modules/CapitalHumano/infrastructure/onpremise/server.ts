import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importOrganization } from '../../application/importOrganization';
import type { Deps } from '../../application/ports';
import { FileOrganizationRepository } from '../persistence/fileRepository';
import { buildApp } from './app';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../../..');
const dataDir = process.env.ORIGO_DATA_DIR ?? resolve(repoRoot, 'data/local');
const port = Number(process.env.PORT ?? 3001);

// First start: load the local dataset if one was prepared, otherwise the invented one.
const seedCandidates = [resolve(dataDir, 'organization.import.json'), resolve(repoRoot, 'seed/organization.test.json')];

async function main(): Promise<void> {
  const repo = await FileOrganizationRepository.open(resolve(dataDir, 'organization.events.jsonl'));
  const deps: Deps = { repo, clock: () => new Date(), newId: randomUUID };

  if ((await repo.load()).dataAsOf === null) {
    for (const path of seedCandidates) {
      const text = await readFile(path, 'utf8').catch(() => null);
      if (text === null) continue;
      const result = await importOrganization(
        { mode: 'apply', files: [{ name: 'seed.json', text }], actor: { personId: 'seed', system: true } },
        deps,
      );
      console.log(`Seeded from ${path}:`, result.summary);
      for (const item of result.items.filter((i) => i.action === 'error').slice(0, 10)) console.warn('  rejected', item);
      break;
    }
  }

  const app = buildApp(deps);
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`Origo · Capital Humano API on http://127.0.0.1:${port} (data: ${dataDir})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
