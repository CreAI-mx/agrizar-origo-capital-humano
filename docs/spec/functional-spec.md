# Functional specification

Scope, in priority order (confirmed by the story owner on 2026-10-12):

1. **MD-2 Árbol de organización** — Jira GRZR-31. This is what gets built first.
2. **Centro de mando** (dashboard hub) — in scope, after MD-2.
3. **Organigrama** as a people chart — a later view over the MD-2 data.

Where it runs: the Back Office is the frontend that will live in Silia. There
is no approval to deploy in Silia yet, so it is built in this repo and run
locally, laid out for a later move (`docs/architecture/silia-migration.md`).

Sources:
- **GRZR-31**, with its epic GRZR-17 and neighbours GRZR-30 (AG-1), GRZR-41
  (MD-2 validation), GRZR-42 (MD-5). Read on 2026-10-12.
- **REF-HUB**: `Centro de mando — Capital Humano Agrizar.html` (line numbers
  refer to that file).
- **REF-ORG**: the published "Organigrama Agrizar 2026" artifact.

Traceability to Origo objectives: MD-2 is governance master data. It serves
both root objectives indirectly: it decides who may see and write the forecast
and P&L views (epic GRZR-17: "cada rol ve solo lo que le toca").

## 1. MD-2 Árbol de organización (GRZR-31)

> Como administrador de Origo en Agrizar quiero cargar en Origo las áreas,
> roles y equipos reales de Agrizar, para que la estructura real de áreas y
> roles gobierne quién ve qué.

Window: built in DEV during S2–S3 (12 to 23 Oct 2026). Validation with users
(STAGE, 26–30 Oct) and PROD are a separate story, GRZR-41.

### 1.1 Acceptance criteria and how they are met

| Jira acceptance criterion | Met by |
|---|---|
| AC1 · Áreas, roles y equipos reales (S2) | M2-01 to M2-08, M2-20 |
| AC2 · Carga y mantenimiento en Back Office (S2–S3) | M2-10 to M2-19, M2-24 to M2-27 |
| AC3 · Demo interna en DEV con datos de prueba, de punta a punta, lista para STAGE en S4 | M2-20 to M2-23, §1.5 demo script |
| DoD · Tests automatizados que cubren los ACs | §1.6 |

### 1.2 Vocabulary

| Term (UI, Spanish) | Code | Meaning |
|---|---|---|
| Área | `OrgUnit` | A node of the organization tree: empresa, dirección, área or subárea |
| Rol | `Role` | What a person does in the organization, used to decide access. ASSUMPTION: one catalog serves both the organizational role and the access role; a job title is free text on the assignment |
| Equipo | `Team` | A named group of people inside one área, with an optional lead |
| Persona | `Person` | Someone who can be assigned; identified by their corporate account |
| Asignación | `RoleAssignment` | Person + role + área. The área is the scope: it covers that área and everything under it |
| Integrante | `TeamMembership` | Person + equipo |

### 1.3 Requirements

Structure (AC1)

| ID | Requirement |
|---|---|
| M2-01 | The organization is one tree with a single root. Each área has a kind (`empresa`, `direccion`, `area`, `subarea`), a unique code, a name and a parent |
| M2-02 | An área can be moved under another parent. A move that would create a cycle or break the kind order is rejected with a message that names both áreas |
| M2-03 | Roles are a catalog: unique code, name, description and optional level on the ladder (director, gerente, jefe, coordinador, líder, supervisor, especialista, analista, auxiliar, practicante) |
| M2-04 | An equipo belongs to exactly one área, has a unique code inside it, a name and an optional lead |
| M2-05 | A person can hold several role assignments. Each assignment names the role and the área it applies to |
| M2-06 | A person can belong to several equipos |
| M2-07 | Nothing is deleted. Áreas, roles, equipos, people, assignments and memberships are deactivated; history stays readable (Origo: append-only, superseding rows). Every screen can show its inactive records, with their history and a way to reactivate them |
| M2-08 | An área with active children, equipos or assignments cannot be deactivated; the message lists what is in the way. Same for a role with active assignments and an equipo with members |

Access (the "gobierna quién ve qué" part)

| ID | Requirement |
|---|---|
| M2-09 | The system answers, for any person: their roles, the áreas they cover (assigned áreas plus all descendants) and their equipos. This is the single interface AG-1 (GRZR-30) and MD-5 (GRZR-42) build on. The role × view × action matrix itself is MD-5, not this story |

Back Office: maintenance (AC2)

| ID | Requirement |
|---|---|
| M2-10 | The organization is shown as an interactive diagram: connected área cards that can be panned and zoomed, branches that collapse, search by name or code (accents ignored) that frames the matches, and per área its head, equipos and people under it. A list view is available as an alternative |
| M2-11 | Create, rename, move and deactivate an área from the tree |
| M2-12 | Roles screen: a diagram with the ladder drawn left to right from director down, wrapping into rows, and the roles outside it in their own row; a list as alternative; create, edit, deactivate; where each role is used |
| M2-13 | Equipos: a diagram of áreas that open into their equipos, and equipos into their integrantes, with a list as alternative; create, edit, set lead, add and remove integrantes |
| M2-14 | Personas: list, create, edit, assign and revoke roles per área |
| M2-15 | Every screen shows when the data was last changed and by whom; each record has a history panel (what changed, who, when). A person's history includes the roles given and revoked and the equipos joined and left; an equipo's includes who joined and left. The header says whether the loaded data was declared invented or may include real people |
| M2-16 | Only the role "Administrador de Origo" can change the organization; everyone else reads |

Back Office: loading (AC2)

| ID | Requirement |
|---|---|
| M2-17 | Bulk load from CSV files (áreas, roles, equipos, personas with their assignments) or one JSON file. Excel files are not read yet. ASSUMPTION: the format is ours until Eduardo's input arrives; a different layout is a change in one parser |
| M2-18 | A load is always previewed first: rows to create, to change, unchanged, and rows with errors (unknown parent, duplicate code, cycle, unknown role, lead who is not a member). Nothing is written until the administrator confirms, and the API enforces it: confirming names the preview, which must be of the same files, by the same person, with the organization unchanged since |
| M2-19 | Loading the same file twice changes nothing the second time. Each load is logged: file, who, when, counts, errors |

Demo readiness (AC3)

| ID | Requirement |
|---|---|
| M2-20 | An invented dataset ships with the repo (`seed/organization.test.json`) and is what the tests use. For the local demo, `scripts/extract_organigrama.py` converts REF-ORG into the load format under `data/local/`, which is git-ignored because it holds real names. The header labels the environment as local DEV |
| M2-21 | One command starts the app locally with the test dataset loaded |
| M2-22 | "Ver como": the administrator picks a person and the organization diagram lights the áreas that person's roles cover, names the role on the área where it was given, and lists roles and equipos |
| M2-23 | UI copy in Spanish; works on a laptop screen; keyboard reachable |
| M2-24 | Filter by área or departamento: one selector above the tabs narrows áreas, equipos, people and role counts to an área and everything under it, and stays on while moving between tabs. An área's detail offers "Ver solo esta área". Source: tech lead review of the demo, 12 Oct 2026 |
| M2-25 | Crop identity: each branch under the empresa carries one of the six crops Agrizar grows, as a solid seal on the dirección and a tint on its áreas, subáreas and equipos, in the diagrams, the lists and the área filter, with a legend. Presentation only; the crop is derived, not stored. Source: story owner decision, 13 Oct 2026 (`docs/adr/ADR-0002-crop-identity.md`) |
| M2-26 | People directory that scales: the Personas screen asks the API for one page at a time (25, 50 or 100), already searched and filtered there by name, job title, account, employee number, role, equipo and área. Four trays count what needs attention within the chosen área and filter on click: people with no equipo, no account, no role, and inactive people. Source: story owner request for something maintainable with thousands of people, 13 Oct 2026 |
| M2-27 | Person profile: opening a person shows their roles with the área path, their equipos, what their roles let them see (M2-09) and their line of command, with links to each person in it and to their área in the diagram. `ASSUMPTION:` the line of command is inferred, not captured: a person answers to the lead of their equipo, otherwise to whoever holds the highest ladder role on their área or on the nearest área above that has one. The screen says so (Q-6) |

### 1.4 Out of scope for GRZR-31

- Validation with users and going to PROD (GRZR-41).
- The role × view × action matrix, column hiding and row-level data views (MD-5, GRZR-42).
- The write/approve matrix per field data item and the approval inbox (AG-1, GRZR-30).
- Sync with Entra ID groups, Fortia or BioSync. People are loaded, not synced.
- Deployment to Silia or to a cloud DEV environment (pending approval).

### 1.5 Demo script (AC3)

1. Start the app locally; the tree shows the test organization.
2. Load a file that adds one área, renames another and contains one bad row.
   The preview shows 1 to create, 1 to change, 1 error; confirm; the tree updates.
3. Load the same file again: the preview shows nothing to change.
4. Create an equipo in the new área, add two people, set a lead.
5. Assign a person the role Supervisor on a dirección.
6. "Ver como" that person: every área under that dirección is covered.
7. Try to deactivate the dirección: rejected, with the list of what is in the way.
8. Open the history of the renamed área: both versions, who and when.

### 1.6 Tests required by the Definition of Done

| Level | Covers |
|---|---|
| Unit (domain) | Cycle and kind-order rejection, code uniqueness, deactivation guards, access resolution over descendants, supersession, people paging and trays, line of command |
| Unit (application) | Each use case against the in-memory repositories; import preview and idempotent re-run |
| Contract | Every repository adapter passes the same test suite |
| API | Each endpoint: happy path, validation error, forbidden for non-administrators |
| End to end | The eight demo steps of §1.5, automated through the HTTP API (`tests/demo.http.test.ts`). The same steps were run once in a headless browser by hand-written script; a committed browser suite is pending |

### 1.7 Dependencies and open questions

| # | Item | Owner |
|---|---|---|
| D-1 | Eduardo's input with real áreas, roles and equipos. Until it arrives the app runs on test data | Eduardo |
| D-2 | "P-3 instancia en DEV": a shared DEV environment. Until then, local only | Platform |
| Q-1 | Is "rol" the access role, the job title, or both? (see ASSUMPTION in §1.2) | Eduardo / PM |
| Q-2 | What is an "equipo" at Agrizar: a crew, a shift, a supervisor's group? Can a person be in equipos of different áreas? | Eduardo |
| Q-3 | Does the tree cross razones sociales and sites, or is there one tree per entity? | Eduardo / Adrián |
| Q-4 | How are people identified: corporate e-mail, employee number, or both? Many field workers have no account | Eduardo / Capital Humano |
| Q-5 | Which roles does the AG-1 pilot need (capturista, supervisor, aprobador)? | AG-1 story |
| Q-6 | Is the inferred line of command (M2-27) how Agrizar reads its hierarchy, or must "reports to" be captured per person? | Capital Humano |

## 2. Centro de mando (hub) — after MD-2

| ID | Requirement | Source |
|---|---|---|
| H-01 | Show dashboards grouped by area, each area with title and tagline; areas with no dashboards are hidden | REF-HUB:3154-3167 |
| H-02 | Three card variants: standard, full-width band (declared per dashboard, never inferred), and upcoming (not clickable, labelled "Próximamente") | REF-HUB:3092-3134 |
| H-03 | Each active card shows title, cadence badge, description, source, and opens its target in a new tab | REF-HUB:3121-3133 |
| H-04 | Default order inside an area: active first, upcoming last. A saved user order overrides it; dashboards missing from the saved order go last | REF-HUB:3138-3152 |
| H-05 | Area filter ("Todo" plus one option per area); `F` cycles through it | REF-HUB:3349-3360, 3471-3475 |
| H-06 | View toggle between cards and list; the choice is remembered per user | REF-HUB:3362-3372 |
| H-07 | Command palette opened with `⌘K`/`Ctrl+K`, `/`, or the top-bar button; arrows move, Enter opens, Esc closes | REF-HUB:3433-3467 |
| H-08 | Search ignores accents and case and ranks: title starts with the query, title contains it, then area, description or source contain it. Ties: active before upcoming, then most opened | REF-HUB:3379-3398 |
| H-09 | Digit keys `1`–`9` open the corresponding active card, numbered in reading order across areas; hidden areas do not respond | REF-HUB:3028-3033, 3468-3470 |
| H-10 | Usage memory: every open is counted with its time. Cards show "visto hoy / ayer / hace N días"; the last opened card carries a marker | REF-HUB:3045-3077 |
| H-11 | "Lo que más abres": the two most opened dashboards as quick links, shown only once there is usage | REF-HUB:3079-3087 |
| H-12 | Drag to reorder from a handle, only within the same area; the order is remembered; "Volver al orden original" resets it | REF-HUB:3279-3345 |
| H-13 | Hero: greeting by time of day with today's date in es-MX, counts of active and upcoming dashboards, rotating photos with an 8 s crossfade | REF-HUB:3183-3221 |
| H-14 | Top bar: live indicator, dashboard count, search button, "Actualizado <fecha>" stamp, theme toggle | REF-HUB:1651-1658 |
| H-15 | Footer lists every active dashboard with its data source | REF-HUB:3186 |
| H-16 | Dark and light themes; dark is the primary identity | REF-HUB:66-250 |
| H-17 | Ambient effects: WebGL cloud background (theme-aware, about 30 fps, paused when the tab is hidden, removed if WebGL is unavailable), cursor light, card tilt | REF-HUB:3493-3731, 3234-3277 |
| H-18 | With "reduce motion" on, nothing animates: effects jump to their final state | REF-HUB:3026, 3672, 3719-3721 |
| H-19 | Usable on a phone and on very large screens | REF-HUB:1019-1260 |

Changes from the reference, proposed for the real app:

| ID | Change | Why |
|---|---|---|
| H-20 | Preferences and usage are stored per signed-in user, with the browser as cache | The reference keeps them "only in this browser" |
| H-21 | Dashboard links are served by the API to authorized users; they are not bundled in the client | Some links are share links that carry an access key |
| H-22 | The catalog is edited in the Back Office instead of a JSON file and a build script | Removes the "edit JSON, rebuild, republish" loop (REF-HUB:2752) |
| H-23 | Each dashboard shows the date its data is from, not only its cadence | Origo rule: every number shows when the data is from |
| H-24 | A dashboard can be limited to áreas of the MD-2 tree; a person sees the dashboards their áreas cover | Epic GRZR-17: the organization governs access to all views. ASSUMPTION: confirm with MD-5 |

## 3. Organigrama (people chart) — later view over MD-2

| ID | Requirement | Source |
|---|---|---|
| O-01 | One page per dirección or área, with title, counts, change notes and the chart | REF-ORG |
| O-02 | Position box shows role, holder name or "Vacante", área, and the count of people under it | REF-ORG |
| O-03 | Clicking a director's or manager's box drills into that team; breadcrumb back | REF-ORG |
| O-04 | Solid lines for direct reporting, dotted lines for functional reporting | REF-ORG |
| O-05 | Person search by name jumps to that person's área | REF-ORG |
| O-06 | Flags: alta, baja, por confirmar, possible duplicate; data version date and who declared each position | REF-ORG |
| O-07 | Export / print of the current page | REF-ORG |

This needs reporting lines and positions on top of MD-2 (who reports to whom,
vacancies). It is not required by GRZR-31 and is specified separately when
scheduled. REF-ORG disagrees with itself on totals ("trece direcciones" vs 11;
80 vs 81 positions in Contigo): to be settled with Capital Humano then.
