# Functional specification

Derived from two references, not yet from the Jira ticket.

- **REF-HUB**: `Centro de mando — Capital Humano Agrizar.html` (line numbers
  below refer to that file).
- **REF-ORG**: the published "Organigrama Agrizar 2026" artifact.
- **GRZR-31**: could not be read when this was written (Jira requires a
  signed-in browser session). Everything here must be reconciled with the
  ticket's acceptance criteria before estimation.

Traceability to Origo objectives. ASSUMPTION: this app serves Objetivo 2
(weekly P&L per INV) indirectly, as the navigation and organization backbone of
Module 4 Capital Humano: the org structure gives the Asignación de Personal
agent its areas, reporting lines and approvers, and the hub is where labor-cost
views are reached. To be confirmed with the ticket and the module owners.

## 1. Centro de mando (hub)

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
| H-20 | Preferences and usage are stored per signed-in user on the server, with the browser as cache | The reference keeps them "only in this browser"; they are lost across devices |
| H-21 | Dashboard links are served by the API to authorized users; they are not bundled in the client | Some links are share links that carry an access key |
| H-22 | The catalog is edited in an administration screen instead of a JSON file and a build script | Removes the "edit JSON, rebuild, republish" loop (REF-HUB:2752) |
| H-23 | Each dashboard shows the date its data is from, not only its cadence | Origo rule: every number shows when the data is from |
| H-24 | A dashboard target can be an internal route | Visualization moves into Silia later |

## 2. Organigrama

| ID | Requirement | Source |
|---|---|---|
| O-01 | One page per direction or area, with title, position count, team size, change notes and the chart | REF-ORG |
| O-02 | Tab bar of sections grouped by direction; breadcrumb with a link back to the parent | REF-ORG |
| O-03 | Position box shows role, holder name or "Vacante", area label, and the count of positions under it | REF-ORG |
| O-04 | Clicking a director's or manager's box drills into that team | REF-ORG |
| O-05 | Solid lines for direct reporting, dotted lines for functional reporting | REF-ORG |
| O-06 | Person search by name jumps to that person's area and highlights the box | REF-ORG |
| O-07 | Flags on boxes: alta, baja, por confirmar, possible duplicate | REF-ORG |
| O-08 | Export / print of the current page | REF-ORG |
| O-09 | Every page shows the data version date and, per position, who declared it and when | REF-ORG |

Changes from the reference, proposed for the real app:

| ID | Change | Why |
|---|---|---|
| O-10 | Positions are append-only events; a correction supersedes, never edits | Origo non-negotiable |
| O-11 | Import pipeline with a review queue for unconfirmed parents and duplicates | The reference documents a conversion bug and about fifteen hand-set parents awaiting confirmation |
| O-12 | "Vacante" typed in a name field is normalized to a vacancy at import | Noted in REF-ORG |
| O-13 | People map to payroll keys through a crosswalk table | Origo non-negotiable; Fortia / BioSync are read-only |
| O-14 | Visibility by role: who may see which directions | ASSUMPTION: needed once names are behind sign-in; confirm with Capital Humano |
| O-15 | The chart can be viewed as of a past date | Free consequence of O-10; confirm it is wanted |

## 3. Open questions

| # | Question | Owner |
|---|---|---|
| Q1 | What does GRZR-31 actually ask for, and what are its acceptance criteria? | PM |
| Q2 | Is the hub in scope, or only the org chart? | PM / Capital Humano |
| Q3 | REF-ORG states both "trece direcciones" and 11 directions, and 80 vs 81 positions in Contigo. Which is right? | Capital Humano |
| Q4 | Who may see names and reporting lines of other directions? | Capital Humano |
| Q5 | Is Fortia or BioSync the master for people keys (Origo D3)? | Polo / Adrián |
| Q6 | Do the 19 published dashboards stay where they are for now? | Capital Humano |
