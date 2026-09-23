# ADR-0023: The vanilla auto-mount helper is `@standarx/nav/auto`

Status: Accepted
Date: 2026-09-22
Deciders: Wesley Cormier

## Context

[ADR-0011](0011-package-layout-and-adapters.md) puts a "vanilla auto-mount helper" second in
the adapter order (`0011-package-layout-and-adapters.md:130`), after React and before Vue, and left its subpath name the one
open detail of that record — working name `@standarx/nav/auto`, not confirmed; the note at
`0011-package-layout-and-adapters.md:7-8` is where that rider lived and where its closure is now recorded. The same record is
emphatic that the thing is not an adapter: "`vanilla` is not an adapter, because the core is
the vanilla API; the only vanilla-specific artefact is an auto-mount helper"
(`0011-package-layout-and-adapters.md:89-91`).

That sentence sets the bar this record has to clear. The core already mounts in one call —
`createInputSystem({ plugins: [spatialPlugin()] })` — and the spatial engine already reads the
markup with no configuration: it defaults its root to `document.body` and finds containers by
`[data-snav="container"]` alone (`src/spatial/spatial.ts:265-269`,
`src/spatial/containers.ts:10`), then reads `data-snav-enter`, `-wrap`, `-block`, `-trap`,
`-scroll`, `-ignore` and the four `data-snav-<direction>` redirections off the elements as it
walks them (`src/spatial/containers.ts:10-18`, `:45-47`). [ROADMAP.md](../../ROADMAP.md)
describes the v1 item as "build the containers from the attributes with no framework", and that
description is wrong about this engine: the containers are already built from the attributes,
by the plugin, with no framework and no helper. A helper that restated that would be a subpath
for a convenience alias.

So the question this record answers is not "what shall the helper be called" but "what is
actually left for it to do". Two things were, and only two.

## Decision

The subpath is **`@standarx/nav/auto`**, built from `src/auto/auto.ts`. The rider of ADR-0011 is
closed on the working name it proposed. `/mount` reads as a verb waiting for an object, and
`/vanilla` would re-assert in a subpath name exactly what ADR-0011:89-90 denies.

**1. `autoMount(options)`, not an import with a side effect.** `package.json` declares
`"sideEffects": false` (`:26`), so a bare `import "@standarx/nav/auto"` is a module a bundler is
entitled to delete. The entry is a factory like every other one in this package —
`spatialPlugin`, `gamepadPlugin`, `focusRingPlugin` (ADR-0011:169-172) — and nothing runs until
it is called. The signature is `autoMount(options?: AutoMountOptions): AutoMount`
(`src/auto/auto.ts:69`), returning a handle carrying `system`, `null` until there is one, and an
idempotent `destroy` (`AutoMount` at `:58-63`).

**2. It waits for the document.** When `doc.readyState` is `"loading"` the helper defers the
whole construction to `DOMContentLoaded` and returns a usable handle immediately
(`src/auto/auto.ts:97-103`). A module script is deferred by the platform, so most callers never
take that branch; a classic `<script>` in `<head>` does, and without the wait it would hand the
spatial engine a document whose `<body>` does not exist yet. `destroy` before the document is
ready removes the listener and never builds a system at all.

**3. The page chooses the mode, through `data-snav-mode` on the root.** This is the only
declarative capability the helper adds, and it is the reason the subpath earns its existence.
The attribute is read once, off `options.root ?? doc.documentElement`, and only the exact string
`app` selects `app`; anything else, absent included, is `composite`
(`MODE_ATTRIBUTE` at `src/auto/auto.ts:32`, `readMode` at `:65-67`). It is a **new** attribute:
nothing in `src/` read `data-snav-mode` before this record, and
[ADR-0007](0007-navigation-modes.md) mentions the name only to reject a per-container form of it
(`0007-navigation-modes.md:129`). That rejection stands untouched — see the amendment this record adds there.

**4. `plugins` is an array or a factory, and the factory is the point.**
`AutoPlugins = readonly InputPlugin[] | ((config: AutoConfig) => readonly InputPlugin[])`
(`src/auto/auto.ts:47`). An array alone could never be configured by the markup: a caller who
writes `[spatialPlugin({ mode: "app" })]` has already baked the mode into the instance, and a
helper reading an attribute afterwards would have nothing to apply it to. The factory runs once,
after the document is ready, and receives `AutoConfig` — `doc`, `root`, and the parsed `mode`
(`:34-41`). Plugins stay imports rather than attributes because an engine is code: a markup
switch that could pull in the gamepad engine would put it in the graph of every consumer of this
subpath, which is what the subpath layout of ADR-0011 exists to prevent.

**5. No engine is imported, and the type says so without costing bytes.** `SpatialMode` reaches
this module as a type-only import (`src/auto/auto.ts:17`), which erases at build, and is
re-exported (`:21`) because ADR-0011:70-75 requires a subpath to export the types its own
signatures name. The budget line measures 0.60 kB min+gzip against a 0.75 cap
([ADR-0017](0017-size-budgets.md), amendment of 2026-09-22), and its one external is
`../input-system.js`.

**6. It does not move the focus.** `focusFirst` was considered and left out: stealing the focus
at load is a regression on an ordinary web page, and a television that wants it has one line —
`spatial.focusFirst()` on the plugin the caller already holds.

**7. It does not run the adapter parity suite.** The suite of
[ADR-0018](0018-testing-strategy.md) decision 5 asserts fourteen behaviours of a framework
provider, and its first one is "builds exactly one system, and not during the first render"
(`src/adapter-parity.ts:98`). There is no render here, and no provider: `ParityAdapter` would
have to be given an invented render pass to satisfy. The helper takes fourteen browser cases of
its own instead (`src/auto/auto.browser.test.ts`). Vue, Svelte and Angular are adapters and do
run the suite; this is the record of why the one thing that is not an adapter does not.

## Consequences

- One more entry, one more subpath, one more budget line, and a whole-package cap that moved
  from 12.50 to 12.75 kB for 0.23 kB of it. The generated `exports` map gained `./auto`
  (`package.json:34`) and the drift gate makes that visible in review.
- `data-snav-mode` is now part of the attribute contract of
  [ADR-0001](0001-name-scope-and-attribute-prefix.md), and renaming it is a breaking change.
  It is also the first attribute this package reads that no engine reads: a page that sets it
  and never calls `autoMount` gets nothing, silently. That asymmetry is the price of keeping the
  engines free of it.
- A consumer who wants neither of the two things the helper adds should not import it, and
  `docs/en/auto.md` says so rather than presenting `/auto` as the recommended way in.
- The helper is a second place that calls `createInputSystem`, so an option added to
  `InputSystemOptions` and not forwarded here is a silent gap. All four are forwarded today:
  `doc`, `plugins`, `keymap`, `allowVerticalInText`.
- ROADMAP's v1 line is removed as delivered, and its description ("build the containers from
  the attributes") is carried into no document, because the engine already did that.

## Amendment, 2026-09-23: the whole-package cap this record moved no longer exists

The first consequence above says this change cost "a whole-package cap that moved from 12.50 to
12.75 kB for 0.23 kB of it". That was true on 2026-09-22 and it is history now: the
whole-package line was removed on 2026-09-23 ([ADR-0017](0017-size-budgets.md), amendment of
that date), precisely because a sum of every entry goes red when the package gains one rather
than when anything gets fatter — and this record's own entry was the fourth time it had done so.

Nothing about `/auto` changes. Its own line still reads 0.60 of 0.75 kB, and the dated figures
in the Evidence below are what was measured on the day they name.

## Alternatives considered

| Option | Why not |
| --- | --- |
| **`@standarx/nav/mount`** | Reads as a verb with its object missing — `nav/mount` invites "mount what?". It is also not the name ADR-0011 wrote down, so choosing it would spend a rider on a rename that buys nothing. |
| **`@standarx/nav/vanilla`** | ADR-0011:89-90 says "`vanilla` is not an adapter, because the core is the vanilla API". A subpath called `/vanilla` next to `/react` states the opposite in the one place a consumer reads first. |
| **A bare side-effecting import, `import "@standarx/nav/auto"`** | The shortest possible start-up, and impossible here: `"sideEffects": false` (`package.json:26`) lets a bundler drop a module imported for its effects alone. Dropping the promise for this one entry would cost every other subpath its tree-shaking. |
| **`autoMount()` with no arguments, constructing `spatialPlugin` itself** | The most convenient form, and the one that breaks the layout: `/auto` would import `/spatial`, so ADR-0011's "an entry the consumer never imports is never bundled" (`:41-43`) would stop holding, and the line would stop being about the helper: it would carry the spatial engine, measured at 3.04 kB min+gzip on its own line the same day, on top of the helper's 0.60. Rejected on that alone. |
| **No attribute at all, `mode` as an option** | Honest and smaller, and it leaves the helper with one behaviour — the `DOMContentLoaded` wait — which does not earn a public subpath. It would also make ADR-0011's "attribute-driven start-up" (`0011-package-layout-and-adapters.md:130`) a description of nothing. |
| **Per-container `data-snav-mode`, the form ADR-0007 rejected** | Still rejected, for ADR-0007's own reason (`0007-navigation-modes.md:129`): the mode would depend on where the focus is and could change mid-move. The attribute here is read once, on one element, before the engine exists. |
| **Running the adapter parity suite against it** | The suite's contract is a provider with a render pass and two nested scope components (`src/adapter-parity.ts:69-88`). Satisfying it would mean inventing that shape for an API that has none, which is a test asserting the fixture rather than the helper. |

## Evidence

- The rider this record closes, and the order it sits in:
  `0011-package-layout-and-adapters.md:7-8` (the rider, and the note recording its closure),
  `:130` (second in the adapter order), `:89-91` (`vanilla` is not an adapter), `:41-43` (an entry
  the consumer never imports is never bundled), `:70-75` (a subpath re-exports the types its
  signatures name), `:169-172` (entries stay factory-based because `sideEffects: false` is a
  promise).
- The helper: `src/auto/auto.ts`, 120 lines — `MODE_ATTRIBUTE` (`:32`), `AutoConfig` (`:34-41`),
  `AutoPlugins` (`:47`), `AutoMountOptions` (`:49-56`), `AutoMount` (`:58-63`), `readMode`
  (`:65-67`), `autoMount` (`:69`), the still-parsing branch (`:97-103`).
- What the spatial engine already reads without a helper: `rootOf` defaulting to `document.body`
  (`src/spatial/spatial.ts:265-269`), `CONTAINER_SELECTOR` and the eight container attributes
  (`src/spatial/containers.ts:10-18`), `directionAttribute` (`:45-47`).
- That `data-snav-mode` was new on this date: `MODALITY_ATTRIBUTE = "data-snav-input"`
  (`src/modality.ts:19`) is the only other `mode`-shaped name in the package and is written by
  the library rather than read from the page; ADR-0007's only mention of `data-snav-mode` is the
  rejected per-container row (`0007-navigation-modes.md:129`), and mode until now was read from
  the options at construction (`:55-58`).
- Coverage: `src/auto/auto.browser.test.ts`, fourteen cases by `grep -c "^  it(" ` on 2026-09-22
  — the two plugin shapes, the two forwarded options, the four mode cases including an explicit
  root, three on a document whose `readyState` accessor is shadowed to `"loading"`, and two on
  `destroy`. `bun run test` on 2026-09-22: 357 passed, 1 skipped, 23 files.
- Size: `bun run build && bun run check:size` on 2026-09-22 — `auto mount` 1.00 kB min,
  0.60 kB min+gzip, cap 0.75 kB, 80 % used; `whole package` 12.63 of 12.75 kB.
  [ADR-0017](0017-size-budgets.md), two amendments of 2026-09-22, the second correcting the
  first by the two hundredths of a kB that `MODE_ATTRIBUTE` going private cost.
- Why the parity suite is not run here: its fourteen cases and the `ParityAdapter` contract,
  `src/adapter-parity.ts:69-88` and `:98`; the suite's growth from six behaviours is recorded at
  `0018-testing-strategy.md:145-153`.
- Related: [ADR-0001](0001-name-scope-and-attribute-prefix.md) (the attribute prefix and the
  reserved subpaths), [ADR-0007](0007-navigation-modes.md) (what `composite` and `app` mean),
  [ADR-0017](0017-size-budgets.md) (the line and its cap).
