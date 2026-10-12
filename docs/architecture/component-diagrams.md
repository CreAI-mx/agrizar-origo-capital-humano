# Component diagrams

Architecture description of Origo · Capital Humano (Centro de mando +
Organigrama), organized the way SWEBOK asks a design to be recorded.

## How this follows SWEBOK

SWEBOK (Guide to the Software Engineering Body of Knowledge, v4; the Software
Architecture and Software Design knowledge areas) asks for a design to be
described through several **views**, each answering one stakeholder concern,
using **structural** (static) and **behavioral** (dynamic) descriptions.

| SWEBOK element | Where it is in this document |
|---|---|
| Architecture views and viewpoints (ISO/IEC/IEEE 42010) | §1 context, §2–§4 logical, §5 deployment, §6 behavior, §7 data |
| Structural description: component diagram | §2, §3, §4 |
| Structural description: deployment diagram | §5 |
| Structural description: entity-relationship diagram | §7 |
| Behavioral description: sequence diagram | §6.1, §6.2 |
| Behavioral description: state diagram | §6.3 |
| Design principles (abstraction, coupling and cohesion, decomposition and modularization, encapsulation, separation of interface and implementation, separation of concerns) | §8 |
| Key design issues (concurrency, events, persistence, distribution, error handling, interaction and presentation, security) | §9 |
| Design rationale | `../adr/ADR-0001-technology-stack.md` |

Component diagram convention: a box is a component; a labelled arrow
`A -->|interface| B` means **A requires an interface that B provides**.

## 1. Context view

Who and what the system talks to.

```mermaid
flowchart LR
  dir["Dirección de Capital Humano<br/>(daily user)"]
  lead["Directors and managers<br/>(consult org chart)"]
  admin["CH administrator<br/>(maintains catalog and structure)"]

  subgraph sys["Origo · Capital Humano"]
    hub["Centro de mando<br/>dashboard hub"]
    org["Organigrama<br/>org chart"]
  end

  entra["Entra ID<br/>(Agrizar Active Directory)"]
  dash["Published dashboards<br/>(19 today; Silia views later)"]
  payroll["Fortia / BioSync<br/>(payroll master, read-only)"]
  srcs["Org source files<br/>(PDF, area declarations)"]
  silia["Silia platform<br/>(agents, shell, auth)"]

  dir --> hub
  lead --> org
  admin --> hub
  admin --> org
  sys -->|sign-in, roles| entra
  hub -->|opens| dash
  org -.->|headcount keys via crosswalk, future| payroll
  srcs -->|import + review| org
  sys -.->|becomes a module of| silia
```

## 2. Logical view: top-level components

```mermaid
flowchart TB
  subgraph spa["Web client (React SPA)"]
    shell["App Shell<br/>routing, layout, session, theme"]
    fhub["Feature: Hub"]
    forg["Feature: Organigrama"]
    fadm["Feature: Administration"]
    ds["Agrizar Design System"]
    apic["API Client<br/>(types generated from OpenAPI)"]
    prefs["Preferences Store"]
  end

  subgraph mod["Module CapitalHumano (backend)"]
    http["HTTP Adapter"]
    app["Application<br/>(use cases)"]
    dom["Domain<br/>(catalog, org structure, rules)"]
    ports["Outbound Ports"]
    adapters["Adapters<br/>(store, identity, audit)"]
  end

  entra["Entra ID"]
  store[("Org and catalog store")]
  ext["Published dashboards"]

  shell --> fhub
  shell --> forg
  shell --> fadm
  fhub -->|components, tokens| ds
  forg -->|components, tokens| ds
  fadm -->|components, tokens| ds
  fhub -->|ICatalogQuery, IUsageTracking| apic
  forg -->|IOrgChartQuery| apic
  fadm -->|ICatalogAdmin, IOrgAdmin| apic
  fhub -->|IPreferences| prefs
  prefs -->|IPreferences, server adapter| apic
  apic -->|REST / JSON over HTTPS| http
  http --> app
  app --> dom
  app -->|repository and service ports| ports
  adapters -.->|implements| ports
  adapters --> store
  adapters -->|OIDC token validation| entra
  shell -->|sign-in| entra
  fhub -->|opens target| ext
```

### Provided and required interfaces

| Component | Provides | Requires |
|---|---|---|
| Feature: Hub | Hub screen, command palette | `ICatalogQuery`, `IUsageTracking`, `IPreferences`, DS components |
| Feature: Organigrama | Org chart screens, person search, print view | `IOrgChartQuery`, DS components |
| Feature: Administration | Catalog editor, import and review queue | `ICatalogAdmin`, `IOrgAdmin` |
| Agrizar Design System | Tokens, primitives, ambient effects | nothing (leaf) |
| Preferences Store | `IPreferences` (order, view, theme) | browser storage now, API later |
| API Client | Typed calls for every backend interface | HTTP, access token from the shell |
| HTTP Adapter | REST endpoints, OpenAPI document | use cases, `IdentityPort` |
| Application | `ICatalogQuery`, `ICatalogAdmin`, `IOrgChartQuery`, `IOrgAdmin`, `IUsageTracking`, `IPreferences` | domain, outbound ports |
| Domain | Entities, value objects, rules | nothing (leaf) |
| Adapters | Port implementations | store, Entra ID, clock |

## 3. Logical view: web client decomposition

```mermaid
flowchart TB
  subgraph shell["App Shell"]
    router["Router"]
    session["Session Provider<br/>(IdentityPort)"]
    theme["Theme Provider<br/>(dark / light)"]
    topbar["Top Bar<br/>freshness stamp, search, theme"]
  end

  subgraph hub["features/hub"]
    hero["Hero<br/>greeting, rotating photos, counts"]
    quick["Quick Access<br/>most opened"]
    filt["Area Filter + View Toggle"]
    grid["Catalog Grid / List"]
    card["Dashboard Card<br/>standard, band, upcoming"]
    palette["Command Palette"]
    keys["Keyboard Shortcuts"]
    hsvc["hub services + hooks<br/>search ranking, ordering, usage"]
  end

  subgraph org["features/organigrama"]
    tabs["Area Tabs + Breadcrumb"]
    canvas["Org Chart Canvas"]
    node["Position Node<br/>role, holder, vacancy, flags"]
    psearch["Person Search"]
    notes["Change Notes + Provenance"]
    print["Print / Export View"]
    layout["tree layout<br/>(pure function)"]
    osvc["organigrama services + hooks"]
  end

  subgraph ds["agrizar-ds"]
    tokens["tokens.css"]
    prim["Primitives<br/>Panel, Badge, Segmented, Kbd, Toast, Dialog"]
    amb["Ambient<br/>Clouds (WebGL), Cursor Light, Tilt"]
  end

  router --> hub
  router --> org
  grid --> card
  filt --> grid
  palette --> hsvc
  keys --> hsvc
  quick --> hsvc
  grid --> hsvc
  canvas --> node
  canvas --> layout
  tabs --> osvc
  psearch --> osvc
  canvas --> osvc
  print --> layout
  hub --> prim
  org --> prim
  prim --> tokens
  amb --> tokens
  shell --> amb
  theme --> tokens
```

Rule: components render, hooks hold state, services hold logic and API calls
(Silia's React architecture guideline). Search ranking, card ordering and tree
layout are pure functions with unit tests and no React imports.

## 4. Logical view: backend module (hexagonal)

```mermaid
flowchart LR
  subgraph inb["Inbound adapters"]
    rest["REST handlers<br/>(Fastify now; Lambda / Azure Functions in Silia)"]
    tools["Agent tools<br/>(Silia agents, future)"]
  end

  subgraph appl["application/ (one folder per use case)"]
    uc1["listCatalog"]
    uc2["recordDashboardOpen"]
    uc3["getPreferences / savePreferences"]
    uc4["getOrgUnitTree"]
    uc5["searchPeople"]
    uc6["importOrgSnapshot"]
    uc7["reviewOrgChange"]
    uc8["upsertDashboard"]
  end

  subgraph domn["domain/"]
    cat["Dashboard Catalog<br/>Area, Dashboard, Target"]
    orgs["Org Structure<br/>OrgUnit, Position, Assignment, ReportingLine"]
    rules["Rules<br/>level ladder, vacancy normalization,<br/>duplicate detection, supersession"]
  end

  subgraph outp["Outbound ports"]
    p1["CatalogRepository"]
    p2["OrgRepository"]
    p3["PreferencesRepository"]
    p4["UsageEventSink"]
    p5["IdentityPort"]
    p6["AuditLog"]
    p7["Clock"]
    p8["PayrollMasterPort (future)"]
  end

  subgraph outa["Outbound adapters"]
    mem["In-memory + JSON seed"]
    db["Store adapter<br/>(MongoDB or relational, per D1/D2)"]
    oidc["Entra ID (OIDC)"]
    fortia["Fortia / BioSync reader<br/>(read-only, crosswalk)"]
  end

  rest --> appl
  tools -.-> appl
  appl --> domn
  appl --> outp
  mem -.->|implements| p1
  mem -.->|implements| p2
  mem -.->|implements| p3
  db -.->|implements| p1
  db -.->|implements| p2
  db -.->|implements| p4
  oidc -.->|implements| p5
  fortia -.->|implements| p8
```

Dependency rule: arrows point inward. `domain/` imports nothing; `application/`
imports `domain/` and port types; adapters import everything they need and are
the only code that knows a framework, SDK or driver.

## 5. Deployment view

Today the app runs outside Silia; the target is to be a Silia module.

```mermaid
flowchart TB
  subgraph now["Interim (before Silia is deployed for Agrizar)"]
    b1["Browser"]
    cdn1["Static host<br/>SPA build"]
    api1["Node container<br/>Fastify + CapitalHumano module"]
    st1[("Seed files / dev store")]
    b1 -->|HTTPS| cdn1
    b1 -->|HTTPS, REST + bearer token| api1
    api1 --> st1
  end

  subgraph target["Target (inside Silia, Agrizar tenant)"]
    b2["Browser"]
    shell2["Silia app shell<br/>hosts features/hub and features/organigrama"]
    gw["API gateway"]
    fn["CapitalHumano handlers<br/>(serverless or container)"]
    st2[("Silia / Origo store")]
    auth2["Silia Auth ↔ Entra ID"]
    b2 -->|HTTPS| shell2
    shell2 -->|HTTPS, REST| gw
    gw --> fn
    fn --> st2
    shell2 --> auth2
    gw --> auth2
  end

  now -.->|folder move, new handlers, new store adapter| target
```

## 6. Behavioral view

### 6.1 Open a dashboard from the command palette

```mermaid
sequenceDiagram
  actor U as User
  participant P as Command Palette
  participant S as hub services
  participant Q as Query cache
  participant A as API (CapitalHumano)
  participant R as Repositories

  U->>P: presses ⌘K, types "nomina"
  P->>S: rank(catalog, "nomina", usage)
  Note over S: accent-insensitive. Title prefix first,<br/>then title match, then other fields.<br/>Active before upcoming, most opened first
  S-->>P: ordered results
  U->>P: Enter
  P->>S: open(dashboard)
  S->>Q: optimistic usage update
  S-)A: POST /dashboard-opens
  A->>R: append DashboardOpenEvent
  S->>U: opens target in a new tab
  A--)S: 202 Accepted
  Note over S,A: if the POST fails the event is queued and retried,<br/>opening the dashboard never waits on it
```

### 6.2 Import a new org structure and review it

```mermaid
sequenceDiagram
  actor Ad as CH administrator
  participant UI as Administration feature
  participant A as API
  participant I as importOrgSnapshot
  participant D as Domain rules
  participant O as OrgRepository

  Ad->>UI: uploads source (declared by, declared on)
  UI->>A: POST /org/snapshots
  A->>I: run
  I->>D: normalize ("Vacante" in name → vacancy), detect duplicates,<br/>validate parents and levels
  D-->>I: proposed position events + findings
  I->>O: append events with status "por confirmar"
  A-->>UI: snapshot id + review queue
  loop each finding
    Ad->>UI: confirm, fix parent, or reject
    UI->>A: POST /org/changes/{id}/review
    A->>O: append superseding event (never update)
  end
  Note over O: the current chart is a view over the latest<br/>non-superseded event of each position
```

### 6.3 Life cycle of a position record

```mermaid
stateDiagram-v2
  [*] --> PorConfirmar: imported or declared
  PorConfirmar --> Vigente: reviewer confirms
  PorConfirmar --> Rechazado: reviewer rejects
  Vigente --> Vigente: superseding event (new holder, new parent, new title)
  Vigente --> Vacante: holder leaves (baja)
  Vacante --> Vigente: new holder (alta)
  Vigente --> Cerrada: position removed from structure
  Vacante --> Cerrada: position removed from structure
  Rechazado --> [*]
  Cerrada --> [*]
```

## 7. Data view

```mermaid
erDiagram
  AREA ||--o{ DASHBOARD : groups
  DASHBOARD ||--o{ DASHBOARD_OPEN_EVENT : "is opened"
  APP_USER ||--o{ DASHBOARD_OPEN_EVENT : opens
  APP_USER ||--o{ USER_PREFERENCE : keeps
  ORG_UNIT ||--o{ ORG_UNIT : contains
  ORG_UNIT ||--o{ POSITION_EVENT : "places position in"
  ORG_SNAPSHOT ||--o{ POSITION_EVENT : produces
  PERSON ||--o{ POSITION_EVENT : holds
  POSITION_EVENT ||--o| POSITION_EVENT : supersedes
  PERSON ||--o{ PERSON_CROSSWALK : "maps to legacy key"
  ORG_UNIT ||--o{ CHANGE_NOTE : annotates

  AREA {
    string id PK
    string title
    string tagline
    int sort
  }
  DASHBOARD {
    string id PK
    string area_id FK
    string title
    string status "active | upcoming"
    string cadence
    string source
    string layout "standard | band"
    string target_kind "external | internal"
    date data_as_of
  }
  DASHBOARD_OPEN_EVENT {
    string id PK
    string user_id FK
    string dashboard_id FK
    datetime opened_at
  }
  USER_PREFERENCE {
    string user_id FK
    string key
    json value
    datetime updated_at
  }
  ORG_UNIT {
    string id PK
    string parent_id FK
    string kind "direccion | area | subarea"
    string name
  }
  POSITION_EVENT {
    string event_id PK
    string position_id
    string code "e.g. CH-007"
    string role_title
    string level
    string org_unit_id FK
    string reports_to_position_id
    string line_type "solid | dotted"
    string holder_person_id FK "null = vacant"
    string status
    string declared_by
    date declared_on
    string supersedes_event_id FK
    datetime recorded_at
  }
  PERSON {
    string id PK
    string display_name
  }
  PERSON_CROSSWALK {
    string person_id FK
    string system "fortia | biosync"
    string legacy_key
  }
  ORG_SNAPSHOT {
    string id PK
    string source_document
    date effective_on
  }
  CHANGE_NOTE {
    string id PK
    string org_unit_id FK
    date noted_on
    string text
  }
```

`DASHBOARD_OPEN_EVENT` and `POSITION_EVENT` are append-only. The org chart shown
to users is a current-state view: for each `position_id`, the latest event that
no other event supersedes.

## 8. Design principles applied

| Principle (SWEBOK) | How it shows up |
|---|---|
| Abstraction | Ports describe what the app needs (a catalog, an identity) without saying how it is supplied |
| Coupling and cohesion | One feature folder per screen family; one use case per folder; features never import each other |
| Decomposition and modularization | Shell / features / design system on the client; inbound / application / domain / outbound on the server |
| Encapsulation and information hiding | Each feature exports one `index.ts`; storage and transport details stay inside adapters |
| Separation of interface and implementation | Zod and OpenAPI contracts are the interface; adapters are replaceable implementations |
| Separation of concerns | Rendering in components, state in hooks, rules in services and domain |
| Sufficiency, completeness, primitiveness | Use cases are small and single-purpose; the admin feature composes them |

## 9. Key design issues

| Issue (SWEBOK) | Decision |
|---|---|
| Concurrency | Position changes are appended, never updated, so two reviewers cannot overwrite each other; a superseding event names the event it replaces and is rejected if that event is already superseded |
| Control and handling of events | UI is event-driven; usage events are fire-and-forget with a retry queue; theme change is broadcast once, not polled |
| Data persistence | Append-only event collections plus current-state views; preferences are per user; storage engine hidden behind repositories |
| Distribution of components | SPA + stateless API; no server session, so the API can run as containers or functions |
| Error and exception handling, fault tolerance | The hub renders from the last cached catalog if the API is down; WebGL failure removes the canvas and leaves the static background; every list has an empty and an error state |
| Interaction and presentation | Keyboard first (⌘K, `/`, digits, `F`); reduced-motion respected everywhere; print view for the org chart; Spanish copy |
| Security | Entra ID sign-in; role and org-scope checks in the application layer; dashboard links served only to authorized users, never bundled in the client; audit log on every write |
