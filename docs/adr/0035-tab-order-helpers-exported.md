# ADR-0035: The tab order and its edges are exported from the root entry

Status: Accepted
Date: 2026-11-09
Deciders: Wesley Cormier

## Context

`src/tabbable.ts` builds four helpers on top of `getFocusables`: `getTabbables`, the focusables in
the sequential order, `getTabbableEdges`, its first and last entries, and `getFirstTabbable` and
`getLastTabbable`, one edge each (`src/tabbable.ts:111-140`). Until this record the root entry
exported only `FOCUSABLE_SELECTOR`, `focusElement`, `getFocusables`, `isFocusable` and `isTabbable`
from that module (`src/index.ts`), and no subpath exported the other four. The specification said
so: they were "module-internal". The bundler kept them in `dist/tabbable.js` all the same, so the
published package carried code no consumer could import, including the index arithmetic that
replaces `.at(-1)` for the televisions of [ADR-0013](0013-browser-baseline-and-fallbacks.md).

Issue #39 came from a consumer, miralabs-ui, after its upgrade to 0.3.0. Its focus trap had lost an
editing host from its edges. It fixed that with `isTabbable`, which counts an editing host as a Tab
stop, by rebuilding the list as `getFocusables(root, includeRoot).filter(isTabbable)`. That runs
`isFocusable` twice per candidate, while `getTabbables` runs it once and filters on `inTabOrder`
(`src/tabbable.ts:89-96`). The module's header says that whatever traps, restores or rings focus
"asks this module first". A trap is exactly the code that needs the first and the last stop.

## Decision

**1. The four helpers are exported from the root entry.** `src/index.ts` adds `getTabbables`,
`getTabbableEdges`, `getFirstTabbable` and `getLastTabbable` to its re-export of `./tabbable`. They
are the module's own functions, not wrappers, and their signatures do not change.

**2. No `./tabbable` subpath.** The module is already on the core line ([ADR-0017](0017-size-budgets.md)):
everything the root re-exports from it is paid by every consumer of the root. A subpath would
give the same functions a second import path and add an entry to `package.json` `exports` for no saving.

**3. Same contract as `isTabbable`.** The light DOM only ([ADR-0008](0008-shadow-dom.md)). An
editing host is a stop. `tabindex="-1"` takes an element out. `getTabbables(root, includeRoot)`
takes the root first when it is focusable and in the tab order. The edges are `null` on an empty
container.

## Consequences

- A trap or a restore calls `getFirstTabbable(surface)` and `getLastTabbable(surface)`, or
  `getTabbableEdges(surface)` for both in one walk, instead of filtering `getFocusables`.
- The four names join the public API. Renaming or removing one is a breaking change once the API is
  frozen. Before that it still goes in a `feat!` commit ([ADR-0012](0012-versioning-and-release.md)).
- Shipped as a `feat`, so a minor release while the version is below 1.0.0.
- Bytes: no cap moved. The core line goes from 3 495 B to 3 570 B min+gzip, of a 3 584 B cap
  (3.50 kB), so it has 14 bytes of room left. The next change that adds to the core line needs the
  ADR-0017 amendment first.

## Alternatives considered

| Option | Why not |
|---|---|
| **Delete the four helpers** | The bundle loses its unreachable code, but the consumer that asked keeps paying `isFocusable` twice per candidate. The trap edges it needs would be rebuilt outside the module that defines the tab order. |
| **Keep them internal and say so in the header** | Nothing to build, and nothing for the consumer that asked. The dead code stays in the bundle. |
| **A `./tabbable` subpath** | The module is on the core line already. A second import path costs an `exports` entry and saves no byte. |
| **Export `getTabbables` alone** | The edges are what a trap needs. Leaving them out would only move the `tabbables[tabbables.length - 1]` arithmetic, and the reason not to use `.at(-1)`, into every consumer. |

## Evidence

- Code: the re-export block of `./tabbable` in `src/index.ts`; the four helpers at
  `src/tabbable.ts:111-140`; `inTabOrder` at `src/tabbable.ts:89-96`.
- Test: "exports the tab order and its edges from the root entry, the same functions" in
  `src/tabbable.browser.test.ts`, which imports the root entry and checks identity, order, both
  edges and the `null` root. Measured 2026-11-09 with `bunx vitest run src/tabbable.browser.test.ts`:
  19 passed on chromium, firefox and webkit (the last two with `SNAV_BROWSER`). With the export
  stashed it fails on chromium, 1 failed and 18 passed.
- Bytes: `bun run build && bun run check:size` on 2026-11-09, with the script's own min+gzip figure
  printed before rounding: core 3 495 B without the four exports, 3 570 B with them, cap 3 584 B.
- Issue: #39, opened 2026-09-26, measured by its author on `@standarx/nav@0.3.0`.
