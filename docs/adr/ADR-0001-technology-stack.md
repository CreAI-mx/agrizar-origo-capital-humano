# ADR-0001 · Technology stack

- **Status:** Proposed (2026-10-12). Needs sign-off from the creai tech lead
  and the Silia team; closes part of Origo decision **D2**.
- **Jira:** GRZR-31

## Context

The app replicates and extends the "Centro de mando — Capital Humano" artifact:
a hub of 21 HR dashboards plus the company org chart. Three forces shape the
stack:

1. **It must move into Silia.** The Agrizar Silia repos are not deployed, but
   the `CreAI-mx/silia` repository shows the platform's shape:
   - TypeScript end to end, Yarn workspaces + Nx + Lerna.
   - One folder per module, split `application/` (one use case per folder),
     `domain/` (models, types, docs) and `infrastructure/` with one adapter set
     per target (`aws/`, `azure/`, `onpremise/`, `oracle/`).
   - Thin handlers (Middy on Lambda) around use cases; Zod for validation;
     DynamoDB and MongoDB as stores; Jest for tests.
   - A React SPA in `app/` with Ant Design, Storybook, and a mandated
     `features/<feature>/{components,hooks,services,utils,types.ts,index}`
     layout.

   CAVEAT: the default branch of that repo was last pushed on 2025-12-04. The
   Silia team must confirm it is still the baseline (Origo missing input M6).

2. **It must look at least as good as the reference.** The reference has a
   translucent "glass" design system in two themes, a WebGL cloud background,
   3D card tilt, a command palette, drag-to-reorder and an interactive org
   chart. A generic admin kit does not reach that.

3. **Cloud and database are undecided** (Origo D1: Azure Fabric vs AWS). The
   stack cannot hard-wire either.

## Decision

**TypeScript everywhere, a hexagonal backend module that mirrors Silia's
layout, and a React SPA with its own Agrizar design system.**

| Layer | Choice | Reason |
|---|---|---|
| Language / runtime | TypeScript 5 (strict), Node.js 22 LTS | Same language as Silia: migration is a folder move, not a rewrite |
| Repository | npm workspaces monorepo | Zero extra tooling; the layout is compatible with Silia's Yarn + Nx workspaces |
| Backend shape | Hexagonal module `CapitalHumano/{application,domain,infrastructure}` | Identical to Silia's module layout |
| Use cases | Plain functions `(input, deps) => Promise<output>` | Wrappable by Fastify today and by Lambda / Azure Functions handlers in Silia |
| HTTP adapter (interim) | Fastify | Small, typed, fast; lives only in `infrastructure/onpremise` |
| Contracts | Zod schemas → OpenAPI 3.1 → `openapi-typescript` for the client | Silia already uses Zod; creai frontends already generate types from OpenAPI |
| Persistence | Repository ports. Adapter 1: in-memory + JSON seed. Adapter 2: chosen with D1/D2 (MongoDB in Silia, or the Origo relational store) | Keeps the database decision out of the domain |
| Auth | Entra ID through MSAL, behind an `IdentityPort`; a fake identity in dev | Agrizar standard is Active Directory / Entra ID |
| Frontend | React 19 + Vite + TypeScript | Same framework as Silia's `app/`, so features drop into `app/src/features/` |
| Design system | Own `agrizar-ds` package: CSS tokens ported from the reference, Radix primitives, Tailwind CSS v4 | Reaches the reference's visual level; tokens are plain CSS variables that survive any host |
| Motion / interaction | Motion (animation), cmdk (command palette), dnd-kit (reorder) | Purpose-built, accessible, small |
| Org chart | `@xyflow/react` for the interactive canvas, `d3-hierarchy` for layout as a pure function | Custom glass nodes, pan/zoom, and a static SVG render of the same layout for print |
| Client state | TanStack Query (server state), Zustand (UI state), React Router | Already the creai frontend standard (see `creai-tokio-pld-frontend`) |
| Tests | Vitest + Testing Library, Playwright for end to end | creai frontend standard; Vitest's API is Jest-compatible for the move to Silia |
| Quality | ESLint, Prettier, Storybook for the design system | Matches Silia's documentation system |
| CI | GitHub Actions: lint, typecheck, test, build | creai standard |
| Hosting (interim) | Static SPA build + one Node container, cloud-neutral | Runs locally and on any host until D1 is closed |

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Python + FastAPI backend** (creai Solutions standard: `creai-orbit-api`, Tokio repos) | Silia is TypeScript. A Python backend would be rewritten at migration time |
| **Next.js 15** | Silia's `app/` is a client-rendered SPA. Server components and the Next router would have to be removed to migrate. No SEO or SSR need behind a login |
| **Ant Design 5 as the main UI kit** (Silia / `creai-kit` native) | Lowest migration cost, but the glass identity, 3D tilt and custom org-chart nodes fight AntD's styling. Kept only for whatever Silia's shell requires |
| **SvelteKit** | Excellent motion per line of code, but not React: cannot be moved into Silia |
| **Keep the single-file HTML kit** (as `agrizar-origo-recorridos`) | No auth, no shared preferences, no org data model, no tests. Fine for a link menu, not for controlling organization data |
| **Frontend only, no backend** | Enough for the hub, not for the org chart: positions need history, provenance, a review queue and per-role visibility |

## Consequences

- Positive: migration to Silia is mechanical (see `docs/architecture/silia-migration.md`).
- Positive: database and cloud stay open until D1/D2 close.
- Negative: we maintain our own design system instead of reusing `creai-kit`.
  Mitigation: keep it small, token-driven, documented in Storybook.
- Negative: Tailwind's reset can collide with Ant Design inside Silia's shell.
  Mitigation: scope the reset to the feature root and ship tokens as plain CSS
  variables.
- Risk: Silia's current baseline may differ from the repo snapshot. Mitigation:
  confirm with the Silia team before the first sprint; only the adapters and
  the shell integration depend on it.

## Open points to close before "Accepted"

1. Silia team confirms module layout, handler style and frontend host.
2. Store for org data: MongoDB (Silia) vs Origo relational store (D1/D2).
3. Whether Silia's shell will accept a feature with its own design system.
4. Interim hosting for demos until the Agrizar tenant exists.
