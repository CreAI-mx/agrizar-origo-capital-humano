# ADR-0002 · Crop identity for the organization chart

- **Status:** Accepted for this repository by the story owner on 2026-10-13.
  Not yet reviewed by the tech lead or by Capital Humano.
- **Jira:** GRZR-31 (MD-2 Árbol de organización), epic GRZR-17
- **Scope:** presentation only. No table, contract or use case changes.

## Context

The tech lead's review of the demo (12 Oct 2026) set the bar: Capital Humano
already has an org chart, built with Claude, and the new one has to give them a
reason to switch ("es el benchmark a vencer"). Function is one half of that
answer and is tracked in the functional spec. This decision is about the other
half: the chart should look like it belongs to Agrizar and to nobody else.

The story owner asked for the produce Agrizar grows to become part of the
component design, "de una manera que se vea bonita y elegante".

**What Agrizar grows.** The Origo project overview lists six crops: tomato,
bell pepper and cucumber in greenhouses; raspberry, blackberry and blueberry in
macro-tunnels. Public sources agree on five of them:

- Bell peppers under the Sunset brand, and a 2019 exclusive agreement to grow
  blueberries and raspberries for Mastronardi BerryWorld America
  ([Sunset, 2019](https://www.sunsetgrown.com/news-stories/agrizar-predicts-berry-sweet-future-with-mastronardi-berryworld-america),
  [The Packer](https://www.thepacker.com/news/produce-crops-news/retail/mexicos-agrizar-supplies-mastronardi-berryworld-america)).
- Tomatoes and cucumbers in a business directory profile
  ([BounceWatch](https://bouncewatch.com/company/agrizar)).
- Blackberry appears only in the project documents.
- Asparagus was reported as a major export in 2015
  ([FreshPlaza](https://www.freshplaza.com/north-america/article/2150464/mexico-agrizar-exports-quality-asparagus-and-peppers/))
  but is absent from the current project documents, so it is left out.

Most public coverage is from 2019 or earlier. The crop list should be confirmed
with Agrizar before it is treated as fixed.

**What was explored.** Six directions were drawn on a design canvas with the
invented demo organization:

| Option | Idea | Outcome |
|---|---|---|
| A · Sello de cultivo | Current dark cards, crop as a small outlined seal | Liked; too quiet on its own |
| B · Lámina botánica | Light theme, crop as a large watermark illustration | Not chosen: only works in light mode |
| C · Racimo | Cards hang from a green stem, solid medallions, colored lines | Liked; too much color for daily use |
| A+C 1 · Sello con tallo | A's cards, C's colored lines | Not chosen |
| A+C 2 · Medallón sobrio | C's hanging medallion, A's neutral palette | Not chosen: needs a different layout |
| **A+C 3 · Sello sólido** | A's layout, C's solid color on the cards | **Chosen** |

## Decision

**Adopt A+C 3: every branch under the empresa carries one crop, shown as a
solid seal on the dirección and as a tint on everything below it.**

1. **Crops.** Six, in this order: pimiento morrón, tomate, pepino, frambuesa,
   zarzamora, arándano. Each has one glyph (a 24-unit line drawing) and one
   color per theme.
2. **Assignment.** The branches that hang directly from the empresa take the
   crops in the order the diagram draws them (saved order, then name). The
   seventh branch starts over. Every área, subárea and equipo inherits the crop
   of its branch. The empresa has no crop: it carries a sprout.
   `ASSUMPTION:` which branch gets which crop has no business meaning. It only
   tells branches apart.
3. **Derived, not stored.** The crop is computed in the frontend
   (`app/src/features/organizacion/crops.tsx`, `cropsOf`). The data model,
   the API read model and the load format are unchanged.
4. **Cards.**
   - Empresa: a filled pill in the accent color (lima in dark, brand green in
     light) with the sprout seal. The root card of the Roles diagram is the
     same pill without the sprout: the sprout belongs to the empresa only.
   - Dirección, or whatever área hangs directly from the empresa: a solid seal
     in the crop color with the glyph, a border in the crop color, and the
     "Dirección" label in the crop color.
   - Área, subárea and equipo: background tinted 10% with the crop color, border
     and people count in the crop color.
   - People, roles and group cards stay neutral. Connectors stay neutral.
5. **Outside the diagrams.** A crop dot before each área in the Áreas list and
   in the Equipos table; the seal in the área detail title and next to the área
   filter; a collapsible legend at the bottom of each diagram that has crops.
6. **Tokens.** Six `--cultivo-*` custom properties per theme in
   `app/src/styles.css`. `design/tokens.css` stays a verbatim port of the
   Agrizar design system and is not edited.

| Crop | Dark | Light |
|---|---|---|
| Pimiento morrón | `#F2A93B` | `#9A5A0A` |
| Tomate | `#F0624D` | `#B23A2B` |
| Pepino | `#58C08A` | `#2C7A4E` |
| Frambuesa | `#EE5D8A` | `#AD2F5A` |
| Zarzamora | `#A283EA` | `#55409A` |
| Arándano | `#6C9BF2` | `#2C55A6` |

## Extension, 2026-10-13: the load told as a crop cycle

The bulk load (spec M2-28) uses the same glyph family for its three steps:
a seed for choosing the files (Siembra), a sprout for the review (Brote) and a
fruit for the applied load (Cosecha). Their colors follow the state of the step
(current, done, to come), never a crop, so they do not compete with the branch
identity above. In the review, each dirección a load touches appears with its
crop seal and tint.

The four files (áreas, roles, equipos, personas) deliberately carry no crop:
a crop means "this branch", and reusing it for a kind of file would blur that.

## Consequences

**Gained**

- A branch is recognizable at a glance at any zoom, and stays recognizable
  across the Áreas, Equipos and "Ver como" diagrams and the lists.
- The identity is Agrizar's own: the seals are the company's crops, not stock
  icons.
- Nothing to migrate: no stored data depends on it. Taking the feature out is a
  frontend-only change, though not a small one: besides `crops.tsx` and its CSS
  block, the seal and the crop are read in `OrganizationPage`, `chartItems`,
  `TreeChart`, `AreasTab`, `TeamsTab` and `ViewAsTab`.

**Costs and risks**

- **A crop can move.** Because assignment follows drawing order, adding,
  renaming or reordering a branch can shift the crops of the branches after
  it. If Capital Humano wants fixed identities ("Producción is always
  pimiento"), the crop has to become an attribute of the área, which is a data
  model change and a new ADR.
- **More than six branches repeat crops.** Two branches then share a color and
  a glyph and are told apart only by name.
- **Pimiento sits close to the warning color.** `#F2A93B` against the design
  system's `--alerta` `#F7B32B`. The seal's glyph and position keep them apart
  today; if warnings start to appear on cards, pimiento should move toward
  orange.
- **The meaning is invented.** Someone may read "Finanzas is pepino" as a
  statement. The legend title says "Un cultivo por dirección" to frame it as a
  label.
- **`color-mix()` is required** for tints and borders. It is available in every
  current browser; an older one shows the cards untinted but still readable.
- **No automated test covers it.** The frontend has no test suite yet. It was
  checked by typecheck, build and a headless-browser walkthrough of the demo
  build in both themes.

## Follow-ups

- Confirm the six crops with Agrizar; decide whether asparagus belongs.
- Review with the tech lead and with Capital Humano.
- Reuse the same seals in the people org chart (priority 3 of this repo).
