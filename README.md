# Origo · Capital Humano — Árbol de organización y Centro de mando

Agrizar's organization tree (áreas, roles, equipos) with its Back Office, and
next the Human Capital command center. Built to move into creai's **Silia**
platform; until that deployment is approved it runs locally from this repo.

Jira: [GRZR-31](https://creai.atlassian.net/browse/GRZR-31) (MD-2 Árbol de
organización), epic GRZR-17 · Client: Agrizar · Program: Origo (creai Solutions).

## Status

| Deliverable | State |
|---|---|
| MD-2 organization tree: API, rules, bulk load, Back Office | Built; runs locally; 81 automated tests |
| Centro de mando (dashboard hub) | Specified, not built |
| Organigrama as a people chart | Specified, not built |

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # API on http://127.0.0.1:3001, Back Office on http://localhost:5173
npm test           # rules, store contract, bulk load, JSON contracts, demo script
npm run typecheck
```

The first start creates `data/local/organization.events.jsonl` and loads it from
`data/local/organization.import.json` if that file exists, otherwise from the
invented dataset in `seed/organization.test.json`. Delete the `.jsonl` file to
start over.

To demo with the published org chart (real names, so it stays out of git):

```bash
python3 -I scripts/extract_organigrama.py <organigrama.html>   # writes data/local/organization.import.json
rm -f data/local/organization.events.jsonl && npm run dev
```

To share a demo without running anything (for example as a Claude artifact):

```bash
npm run build:demo   # writes app/dist-demo/origo-organizacion.html and demo.js
```

That build is the same Back Office with no server: the use cases run in the page on the
in-memory store, seeded with `seed/organization.demo.json`, an organization invented by
`scripts/make_demo_seed.py`. Changes last until the page is reloaded.

There is no sign-in locally. The header has a "Sesión como" selector; only a
person with the role Administrador de Origo can change the organization.

## Layout

| Path | Contents |
|---|---|
| `modules/CapitalHumano/domain/` | Models (Zod), business rules, bulk-load planning. No framework imports |
| `modules/CapitalHumano/application/` | One folder per use case, plus the ports they need |
| `modules/CapitalHumano/infrastructure/` | Stores (memory, append-only file) and the local Fastify server |
| `modules/CapitalHumano/tests/` | Automated tests, including the GRZR-31 demo script |
| `app/src/features/organizacion/` | Back Office feature: React + Ant Design with the Agrizar theme |
| `contracts/` | JSON Schemas: organization read model, people directory read models, organization load format, hub catalog, org chart |
| `design/tokens.css` | Agrizar design tokens, ported from the reference design system |
| `seed/` | Invented organizations for tests and for the shareable demo; hub catalog without links |
| `scripts/` | Dev launcher; converter from the published org chart to the load format; generator of the demo organization |
| `docs/` | Spec, data model, ADR, architecture diagrams, Silia migration map |

## What is deliberately not in git

- **Real people.** `data/local/` is ignored; fixtures are invented.
- **Dashboard links.** Some carry an access key; they live in `seed/private/`.
- **The reference HTML files.** They embed real figures and names.
