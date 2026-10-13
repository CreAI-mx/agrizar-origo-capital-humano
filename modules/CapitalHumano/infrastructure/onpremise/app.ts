import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { getHistory } from '../../application/getHistory';
import { getOrganization } from '../../application/getOrganization';
import { getPersonProfile } from '../../application/getPersonProfile';
import { importOrganization } from '../../application/importOrganization';
import { listPeople } from '../../application/listPeople';
import type { Actor, Deps } from '../../application/ports';
import { resolveAccessContext } from '../../application/resolveAccessContext';
import { saveEntities } from '../../application/saveEntities';
import { ConflictError, DomainError, ForbiddenError } from '../../domain/errors';

/**
 * Local HTTP adapter. Identity is the `x-origo-user` header set by the Back Office user
 * switcher: there is no identity provider in local DEV (ADR-0001). Reads are open to anyone;
 * writes are checked against the organization itself (rule R-12).
 */
export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({ bodyLimit: 20 * 1024 * 1024 });

  const actorOf = (request: FastifyRequest): Actor => {
    const personId = request.headers['x-origo-user'];
    if (typeof personId !== 'string' || !personId) throw new ForbiddenError('Elige con qué persona estás usando Origo.');
    return { personId };
  };

  // The actor is written after the body: a request cannot name who it acts as.
  const acting = (request: FastifyRequest) => ({ ...(request.body as object), actor: actorOf(request) });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      return reply.status(422).send({ code: error.code, message: error.message, details: error.details });
    }
    if (error instanceof ForbiddenError) return reply.status(403).send({ code: 'FORBIDDEN', message: error.message });
    if (error instanceof ConflictError) return reply.status(409).send({ code: 'CONFLICT', message: error.message });
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      return reply.status(400).send({ code: 'INVALID', message: 'Revisa los datos capturados.', details });
    }
    app.log.error(error);
    return reply.status(500).send({ code: 'ERROR', message: 'Algo falló en el servidor. Inténtalo de nuevo.' });
  });

  app.get('/api/organization', () => getOrganization(undefined, deps));
  app.post('/api/organization/entities', (request) => saveEntities(acting(request) as never, deps));
  app.post('/api/organization/imports', (request) => importOrganization(acting(request) as never, deps));
  app.get<{ Params: { personId: string } }>('/api/organization/access/:personId', (request) =>
    resolveAccessContext({ personId: request.params.personId }, deps),
  );
  app.get('/api/organization/people', (request) => listPeople(request.query as never, deps));
  app.get<{ Params: { personId: string } }>('/api/organization/people/:personId', (request) =>
    getPersonProfile({ personId: request.params.personId }, deps),
  );
  app.get<{ Params: { entityId: string } }>('/api/organization/history/:entityId', (request) =>
    getHistory({ entityId: request.params.entityId }, deps),
  );
  return app;
}
