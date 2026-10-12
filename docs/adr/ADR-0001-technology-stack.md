# ADR-0001 · Technology stack

- **Status:** Accepted for this repository by the story owner on 2026-10-12
  (revised that day after reading GRZR-31). The Silia team still has to confirm
  the Silia facts below. It does not close Origo decision **D2** for the rest
  of Origo.
- **Jira:** GRZR-31 (MD-2 Árbol de organización), epic GRZR-17

## Context

Scope, in order: (1) MD-2 organization tree with loading and maintenance in the
Back Office, demo in DEV by 23 Oct 2026; (2) the Centro de mando dashboard hub;
(3) a people org chart later. Four forces shape the stack:

1. **The Back Office is the frontend that will live in Silia.** There is no
   approval to deploy in Silia yet, so the app is built in this repo and run
   locally, then moved. The `CreAI-mx/silia` repository shows the destination:
   - TypeScript end to end, Yarn workspaces + Nx + Lerna.
   - One folder per module, split `application/` (one use case per folder),
     `domain/` and `infrastructure/` with one adapter set per target (`aws/`,
     `azure/`, `onpremise/`, `oracle/`).
   - Zod for validation; DynamoDB and MongoDB as stores; Jest for tests.
   - A React SPA in `app/` built on **Ant Design**, with a mandated
     `features/<feature>/{components,hooks,services,utils,types.ts,index}`
     layout.

   CAVEAT: that repo's default branch was last pushed on 2025-12-04. The Silia
   team must confirm it is still the baseline (Origo missing input M6).

2. **The date is close.** MD-2 must demo end to end in two weeks. Trees,
   tables, forms and modals are needed immediately; building them from
   primitives first is the main schedule risk.

3. **The hub must look like the reference.** Glass panels in two themes, WebGL
   cloud background, card tilt, command palette, drag-to-reorder. That is
   bespoke work no kit provides, but it is the second deliverable, not the first.

4. **Cloud and database are undecided** (Origo D1). Sprint 1's goal mentions an
   AWS environment, which is a hint and not a decision. The stack cannot
   hard-wire either.

## Decision

**TypeScript everywhere; a hexagonal backend module that mirrors Silia's
layout; a React SPA on Ant Design themed with Agrizar tokens, with bespoke
Agrizar components where the hub needs them.**

| Layer | Choice | Reason |
|---|---|---|
| Language / runtime | TypeScript 5 (strict), Node.js 22 LTS or newer | Same language as Silia: migration is a folder move |
| Repository | npm workspaces monorepo | No extra tooling; compatible with Silia's workspaces |
| Backend shape | Hexagonal module `CapitalHumano/{application,domain,infrastructure}` | Identical to Silia's module layout |
| Use cases | Plain functions `(input, deps) => Promise<output>` | Wrapped by Fastify locally and by a Silia handler later |
| HTTP adapter (local) | Fastify | Small and typed; lives only in `infrastructure/onpremise` |
| Contracts | Zod schemas in the module; the client imports their types from the workspace package | Silia already validates with Zod; one source for types and validation |
| Persistence (local) | Repository ports; adapters: in-memory (tests) and an append-only JSON-lines file store (local runs) | No database to install; append-only by construction; document-shaped like Silia's stores |
| Persistence (target) | Chosen with D1/D2: Silia's store or the Origo relational store | Hidden behind the same ports and the same contract tests |
| Auth | `IdentityPort`. Locally: a user switcher over the test dataset. Target: Entra ID / Silia Auth | Lets the demo show "who sees what" without an identity provider |
| Frontend | React 19 + Vite + TypeScript | Same framework as Silia's `app/`; features drop into `app/src/features/` |
| UI components | **Ant Design 5**, themed from `design/tokens.css` (dark and light) | It is what Silia's Back Office uses, and it ships Tree, Table, Form, Upload and Modal on day one |
| Hub surfaces | Own components on the same tokens: glass card, hero, clouds canvas, command palette | The reference's look, without a second component kit or a CSS reset that could collide inside Silia |
| Hub interaction (later) | Motion, cmdk, dnd-kit | Added with the hub, not before |
| People org chart (later) | `@xyflow/react` + `d3-hierarchy` | Added with that view; MD-2 maintenance uses Ant Design's Tree |
| Client state | TanStack Query for server state. Zustand and React Router are added with the hub, when there is UI state and more than one page | creai frontend standard (`creai-tokio-pld-frontend`) |
| Tests | Vitest. The demo script runs end to end through the HTTP API; browser tests (Testing Library, Playwright) are still to be added | creai frontend standard; Jest-compatible API for the move to Silia |
| Quality / CI | ESLint, Prettier, GitHub Actions (lint, typecheck, test, build) | creai standard |
| Deployment | Local: one command starts API and SPA with the test dataset | No Silia or cloud approval yet |

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Own design system on Radix + Tailwind for everything** (the first version of this ADR) | Highest visual ceiling, but it delays MD-2 and the Back Office will live in an Ant Design shell. Tailwind's reset is a collision risk there. The hub gets its look from own components instead |
| **Python + FastAPI backend** (creai Solutions standard) | Silia is TypeScript; a Python backend would be rewritten at migration |
| **Next.js 15** | Silia's `app/` is a client-rendered SPA; server components and the Next router would have to be removed |
| **SvelteKit** | Not React: cannot be moved into Silia |
| **Keep the single-file HTML kit** | No per-user access, no data model, no tests |
| **SQLite or PostgreSQL for local runs** | Adds an install step and picks an engine before D1/D2. The file store is enough for a demo dataset and is replaced through the same port |

## Consequences

- Positive: MD-2 screens are mostly composition of existing components.
- Positive: migration to Silia is mechanical; the Back Office already speaks
  Silia's UI language.
- Positive: database and cloud stay open until D1/D2 close.
- Negative: Ant Design limits how far the Back Office screens can depart from a
  kit look. Accepted: the bespoke effort goes to the hub.
- Negative: the file store is not for concurrent multi-user use. Accepted for
  local DEV; replaced before any shared environment.
- Risk: Silia's current baseline may differ from the repo snapshot. Only the
  adapters and the shell integration depend on it.

## Open points

1. Silia team confirms module layout, handler style, store and Ant Design version.
2. Store for the shared DEV / STAGE environment (needed by S4, 26 Oct).
3. Where STAGE runs if Silia deployment is still not approved by S4.
