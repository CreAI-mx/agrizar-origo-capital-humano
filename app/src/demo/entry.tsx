// Entry of the shareable demo: the Back Office with no server. The same use cases the local
// API runs answer the app's own /api calls on the in-memory store, seeded with the invented
// organization in seed/organization.demo.json. Changes live only in the open page.
import { getHistory } from '../../../modules/CapitalHumano/application/getHistory';
import { getOrganization } from '../../../modules/CapitalHumano/application/getOrganization';
import { getPersonProfile } from '../../../modules/CapitalHumano/application/getPersonProfile';
import { importOrganization } from '../../../modules/CapitalHumano/application/importOrganization';
import { listPeople } from '../../../modules/CapitalHumano/application/listPeople';
import type { Actor, Deps } from '../../../modules/CapitalHumano/application/ports';
import { resolveAccessContext } from '../../../modules/CapitalHumano/application/resolveAccessContext';
import { saveEntities } from '../../../modules/CapitalHumano/application/saveEntities';
import { ConflictError, DomainError, ForbiddenError } from '../../../modules/CapitalHumano/domain/errors';
import { MemoryOrganizationRepository } from '../../../modules/CapitalHumano/infrastructure/persistence/memoryRepository';
import seed from '../../../seed/organization.demo.json';

const deps: Deps = { repo: new MemoryOrganizationRepository(), clock: () => new Date(), newId: () => crypto.randomUUID() };
const ready = importOrganization({ mode: 'apply', files: [{ name: 'seed.json', text: JSON.stringify(seed) }], actor: { personId: 'seed', system: true } }, deps);

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Same answers as the local HTTP adapter (infrastructure/onpremise/app.ts).
const fail = (error: unknown) => {
  if (error instanceof DomainError) return json(422, { code: error.code, message: error.message, details: error.details });
  if (error instanceof ForbiddenError) return json(403, { code: 'FORBIDDEN', message: error.message });
  if (error instanceof ConflictError) return json(409, { code: 'CONFLICT', message: error.message });
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (Array.isArray(issues)) {
    return json(400, { code: 'INVALID', message: 'Revisa los datos capturados.', details: issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) });
  }
  console.error(error);
  return json(500, { code: 'ERROR', message: 'Algo falló. Inténtalo de nuevo.' });
};

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const target = new URL(url, location.href);
  const route = target.pathname.match(/\/api\/organization(?:\/(entities|imports|access|history|people))?(?:\/([^/]+))?$/);
  if (!route) return realFetch(input, init);
  try {
    await ready;
    const [, action, id] = route;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const actor = (): Actor => {
      const personId = (init?.headers as Record<string, string> | undefined)?.['x-origo-user'];
      if (!personId) throw new ForbiddenError('Elige con qué persona estás usando Origo.');
      return { personId };
    };
    if (!action) return json(200, await getOrganization(undefined, deps));
    if (action === 'entities') return json(200, await saveEntities({ ...body, actor: actor() }, deps));
    if (action === 'imports') return json(200, await importOrganization({ ...body, actor: actor() }, deps));
    if (action === 'people') {
      return json(200, id ? await getPersonProfile({ personId: decodeURIComponent(id) }, deps) : await listPeople(Object.fromEntries(target.searchParams), deps));
    }
    if (action === 'access') return json(200, await resolveAccessContext({ personId: decodeURIComponent(id ?? '') }, deps));
    return json(200, await getHistory({ entityId: decodeURIComponent(id ?? '') }, deps));
  } catch (error) {
    return fail(error);
  }
};

void import('../main');
