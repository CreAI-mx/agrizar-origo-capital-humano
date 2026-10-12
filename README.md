# Origo · Capital Humano — Centro de mando y Organigrama

Agrizar's Human Capital command center, rebuilt as a real application: a hub of
HR dashboards (Centro de mando) plus the company org chart (Organigrama), with
organization data kept as append-only records instead of hand-edited HTML.

Jira: [GRZR-31](https://creai.atlassian.net/browse/GRZR-31) · Client: Agrizar ·
Program: Origo (creai Solutions) · Target platform: **Silia**.

> **Status: specification stage.** The technology stack is proposed in
> [ADR-0001](docs/adr/ADR-0001-technology-stack.md) and is not yet accepted, so
> this repo holds specs, contracts and design tokens, not framework code.

## Why this repo exists

The app will live inside Silia, but the Agrizar Silia repositories are not
deployed yet. This repo is laid out so that the code can be moved into Silia
by copying folders, not by rewriting: see
[docs/architecture/silia-migration.md](docs/architecture/silia-migration.md).

## What is here

| Path | Contents |
|---|---|
| `docs/adr/ADR-0001-technology-stack.md` | Proposed stack and the alternatives considered |
| `docs/architecture/component-diagrams.md` | Component, deployment, sequence and data diagrams (SWEBOK structure) |
| `docs/architecture/frontend-options.md` | Frontend framework options compared |
| `docs/architecture/silia-migration.md` | How each folder maps onto Silia |
| `docs/spec/functional-spec.md` | Features and acceptance criteria derived from the reference artifact |
| `contracts/*.schema.json` | JSON Schemas for the dashboard catalog and the org chart |
| `design/tokens.css` | Agrizar design tokens, ported from the reference design system |
| `seed/hub-catalog.json` | The 6 areas and 21 dashboards of the current hub, without links |

## What is deliberately not here

- **Dashboard links.** Some are share links that carry an access key. They live
  in `seed/private/` (git-ignored) until they are served from configuration.
- **People.** The real org chart holds names of ~450 positions. Fixtures in this
  repo are synthetic; real data is loaded at runtime from the import pipeline.
- **The reference HTML.** It embeds screenshots of dashboards with real figures.

## Reference material

- Reference artifact: `Centro de mando — Capital Humano Agrizar.html`
  (single-file hub, design system "agrizar-ds v2 vidrio").
- Published Organigrama artifact (451 positions, one page per direction).
- Origo project guide: `../CLAUDE.md` and `../docs/` in the Agrizar workspace.
