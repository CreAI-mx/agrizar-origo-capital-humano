# Origo · Capital Humano: guide for Claude

HR command center (dashboard hub) and org chart for Agrizar. Part of the Origo
program; will be migrated into creai's **Silia** platform. Jira: GRZR-31.

## Read first
- `docs/spec/functional-spec.md`: what the app must do, with sources
- `docs/adr/ADR-0001-technology-stack.md`: stack (status: **Proposed**)
- `docs/architecture/component-diagrams.md`: components and their interfaces
- `docs/architecture/silia-migration.md`: folder-to-Silia mapping; keep it true

## Stack
**Proposed, not accepted.** Until ADR-0001 is marked Accepted, write specs,
contracts and tokens only. Do not scaffold framework code on an assumed stack.

## Non-negotiables (inherited from Origo)
- Event tables are **append-only**; corrections are superseding rows. Position
  and assignment changes are events, never in-place edits.
- Every displayed number or structure shows **when the data is from**.
- Legacy keys (Fortia, BioSync) map through **crosswalk tables**, never by
  matching names at query time.
- Legacy systems are **read-only**.
- **No secrets in the repo.** Dashboard share links with `?sk=` keys count as
  secrets: they stay in `seed/private/` (git-ignored) or in configuration.
- **No real people in the repo.** Fixtures are synthetic.
- UI copy in Spanish; code, comments and commits in English.
- Business rules cite their source (reference artifact line, PRD section or
  Jira key); inferences are marked `ASSUMPTION:`.

## Silia-readiness rules
- `domain/` and `application/` import nothing from a framework, a cloud SDK or
  a database driver. Everything external goes through a port.
- One use case per folder under `application/`, exported as a plain function
  `(input, deps) => Promise<output>` so any handler (Fastify, Lambda, Azure
  Function) can wrap it.
- Frontend features are self-contained under `features/<name>/` with a single
  `index.ts` entry point, matching Silia's React architecture guideline.
