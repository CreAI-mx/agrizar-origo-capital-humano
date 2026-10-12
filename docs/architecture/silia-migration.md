# Migrating into Silia

The repo is laid out so that each folder has a known destination in Silia.
Evidence for the Silia side comes from `CreAI-mx/silia` (module folders,
`docs/guidelines/react-architecture-guideline.md`). To be confirmed with the
Silia team (Origo missing input M6).

## Folder mapping

| This repo (planned) | Silia destination | Move type |
|---|---|---|
| `modules/CapitalHumano/domain/` | `CapitalHumano/domain/` | Copy as is |
| `modules/CapitalHumano/application/<useCase>/` | `CapitalHumano/application/<useCase>/` | Copy as is |
| `modules/CapitalHumano/infrastructure/onpremise/` (Fastify) | `CapitalHumano/infrastructure/onpremise/` | Copy, adjust wiring |
| — | `CapitalHumano/infrastructure/{aws,azure}/handlers/` | **New**: thin handlers around the same use cases |
| `modules/CapitalHumano/infrastructure/persistence/memory/` | test doubles | Copy as is |
| `modules/CapitalHumano/infrastructure/persistence/<store>/` | Silia store adapter | Rewrite against Silia's data access layer |
| `app/src/features/hub/`, `app/src/features/organigrama/` | `app/src/features/…` | Copy as is |
| `packages/agrizar-ds/` | shared package or `app/src/components/common/agrizar/` | Copy; scope the CSS reset |
| `contracts/*.schema.json` | `CapitalHumano/domain/docs/` + Postman collection | Copy, generate collection |
| `design/tokens.css` | loaded once by the feature root | Copy as is |

## The seams that make this work

1. **Ports own every external dependency.** `domain/` and `application/` never
   import Fastify, a cloud SDK, a database driver or MSAL.
2. **Use cases are plain functions.** `(input, deps) => Promise<output>`. A
   Fastify route, a Middy Lambda handler and an Azure Function are three thin
   wrappers around the same function.
3. **Identity is a port.** `IdentityPort.currentUser()` returns
   `{ userId, displayName, roles, orgScope }`. Entra ID today, Silia's `Auth`
   module after the move.
4. **Preferences are a port.** Order, view, and usage live behind
   `PreferencesPort`, with a browser adapter first and a server adapter later.
   Nothing in the UI calls `localStorage` directly.
5. **Dashboard targets are data, not code.** A dashboard has a `target` of kind
   `external` (today's published dashboards) or `internal` (a Silia route once
   visualization moves into Silia). Changing one is a catalog edit.
6. **The feature root owns its styling.** Tokens are CSS variables on the
   feature root element, so the Agrizar look does not leak into, or get
   overridden by, the host shell.

## Migration checklist

- [ ] Silia team confirms layout, handler style, store and frontend host
- [ ] Add `infrastructure/{aws|azure}/handlers` for each use case
- [ ] Implement the store adapter; run the repository contract tests against it
- [ ] Swap `IdentityPort` to Silia `Auth`; map roles
- [ ] Register routes in Silia's navigation; mount the feature roots
- [ ] Re-run Playwright suite against the Silia deployment
- [ ] Move catalog and org data; verify `dataAsOf` on every screen
