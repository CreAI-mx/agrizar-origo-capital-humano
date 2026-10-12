# Frontend framework options

Goal: the most polished result possible, without making the move into Silia a
rewrite. The reference sets the bar: glass panels in two themes, WebGL cloud
background, cursor-following light, 3D card tilt, staggered entrance, command
palette, drag-to-reorder, and an interactive org chart.

## Options

| | A · React + Ant Design 5 | B · React + own Agrizar DS | C · Next.js 15 + shadcn/ui | D · SvelteKit (Svelte 5) | E · Static HTML kit |
|---|---|---|---|---|---|
| What it is | Vite SPA on `creai-kit` / AntD, themed with Agrizar tokens | Vite SPA; Radix primitives + Tailwind v4 + Motion on the ported tokens | App Router, server components, same UI libs as B | Svelte SPA/SSR with Svelte Flow | Today's approach: one generated HTML file |
| Visual ceiling | Medium: looks like an admin kit unless heavily overridden | **High**: full control of every surface | **High** | **High**, least code for motion | High for one page, no component reuse |
| Move into Silia | **Trivial** (Silia uses AntD) | **Easy**: same React, feature folders copy over | Hard: Next router and server components must be removed | **Rewrite** | Rewrite |
| Org chart | `@xyflow/react`, nodes styled against AntD | `@xyflow/react` with glass nodes | Same as B | Svelte Flow | Hand-written SVG |
| creai familiarity | **High** (PLD, Orbit, Silia) | High (React), new DS to maintain | Medium | Low | High for the hub author |
| Main risk | Fighting AntD styles to reach the look | Tailwind reset vs AntD inside Silia's shell | SSR adds nothing behind a login | No path into Silia | No auth, data model or tests |

## Recommendation: B, with A as the fallback

React 19 + Vite + TypeScript with a small, own design system:

- **Tokens**: `design/tokens.css`, ported verbatim from the reference.
- **Primitives**: Radix UI (dialog, popover, tabs, tooltip) for accessibility.
- **Styling**: Tailwind CSS v4 reading the tokens; reset scoped to the feature root.
- **Motion**: Motion for entrance cascades, shared-layout transitions and tilt.
- **Command palette**: cmdk. **Reorder**: dnd-kit.
- **Org chart**: `@xyflow/react` + `d3-hierarchy`.
- **Ambient**: the reference's WebGL shader as one `<CloudsCanvas>` component.

Choose A instead if the Silia team requires every feature to use Ant Design.
The domain, services, hooks and contracts are identical in both; only the
component layer changes.

## Org chart rendering options

| Library | Fit |
|---|---|
| `@xyflow/react` + `d3-hierarchy` | **Recommended.** React nodes (any design), pan/zoom, minimap, keyboard focus; layout stays a pure, testable function reused by the print view |
| `d3-org-chart` | Fast to start, but nodes are HTML strings: no React components, hard to theme and test |
| Pure CSS/SVG tree | Best print fidelity, no pan/zoom; reasonable for the print view only |
| ELK (`elkjs`) layout | Only if dotted functional lines need automatic routing; heavier bundle |
