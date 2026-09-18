# ADR-0004: Relationship with miralabs-ui: consumer, not fork

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

[ADR-0003](0003-extraction-scope.md) says what moves out of miralabs-ui. This
ADR says what happens to miralabs-ui afterwards. There are only two honest
answers: it keeps a copy, or it becomes a consumer. Anything in between is two
systems drifting apart.

The engine is not loosely coupled to the design system today. Read on
2026-09-18 in miralabs-ui at commit `289fa607`:

| Coupling | Evidence (all `grep -rl`, 2026-09-18) |
|---|---|
| `pushEngageScope` imported **in value** by four state machines | `components/slider/slider.machine.ts`, `components/drawer/drawer.machine.ts`, `components/color-picker/color-picker.machine.ts`, `components/date-field/date-field.machine.ts` (plus a type reference in `components/dialog/dialog.types.ts` and a re-export in `src/index.ts`) |
| `isTextEntryTarget` imported in value | `components/drawer/drawer.connect.ts`, `components/toolbar/toolbar.connect.ts` (re-exported by `src/index.ts`) |
| Components emitting `data-mira-nav*` | 17 files in 14 component directories: calendar, color-picker, date-field, date-picker, dialog, listbox, menu, pagination, popover, search-field, select, tabs, toast, toolbar |
| SCSS reading `html[data-mira-input]` | 9 files under `packages/styles/scss/`: `components/_accordion.scss`, `_breadcrumb.scss`, `_clipboard.scss`, `_color-picker.scss`, `_date-field.scss`, `_focus-ring.scss`, `_tabs.scss`, `_toast.scss`, `mixins/_focus.scss` |

Two more facts shape the decision. `interaction/modality.ts` (180 lines,
`wc -l`, 2026-09-18) is a ref-counted singleton per document: it holds a
`WeakMap<Document, ModalityState>` and writes the modality attribute on
`<html>`. Two copies loaded in one page would both claim that attribute. And
the intent bus keeps one LIFO scope stack per `createInputSystem` instance; a
component pushing an engage scope into one stack while the application listens
on another is a silent failure, not a type error. Duplication here is not a size
problem. It is a correctness problem.

## Decision

The owner decided on 2026-09-18: **miralabs-ui deletes
`packages/core/src/input/` and depends on `@standarx/nav`.** Engage mode and the
keymap go too. One system, one maintainer, one place to fix a bug.

Migration plan, in order:

1. **Publish `@standarx/nav` 0.x from this repository** with the extracted
   engine and its browser test suite. No miralabs-ui change yet.
2. **Open a branch in miralabs-ui.** Replace every import from `src/input/...`
   with the matching subpath of `@standarx/nav` (`pushEngageScope` from the
   core entry, `isTextEntryTarget` from the core entry, `spatialPlugin` from
   `@standarx/nav/spatial`, `gamepadPlugin` from `@standarx/nav/gamepad`).
3. **Rename the attributes in the same branch.** `data-mira-nav*` →
   `data-snav*` in the 14 component directories listed above; `data-focused` →
   `data-snav-focused`; `data-nav-active` → `data-snav-active`;
   `html[data-mira-input]` → `html[data-snav-input]` in the 9 SCSS files;
   `--mira-focus-ring-*` → `--snav-focus-ring-*`.
4. **Delete `packages/core/src/input/` and its tests**, and drop the removed
   symbols from `packages/core/src/index.ts`.
5. **Run the miralabs-ui browser suite as the safety net.** It is the only
   place where the engine is exercised against real components in chromium,
   firefox and webkit. The branch merges when it is green.

Release policy: **no long alias period.** The rename ships as one coordinated
breaking release of miralabs-ui, announced in its changelog. A compatibility
shim that emits both attribute names is possible but is not planned; it is
added only if the owner asks for it, and then with a stated removal version.

Direction rule, restated so it cannot be read two ways: `@standarx/nav` never
imports anything from miralabs-ui, at any level — no source import, no
dependency, no peer dependency, no dev dependency for tests. miralabs-ui
imports `@standarx/nav`. The arrow never reverses. This is the same boundary
rule as [ADR-0003](0003-extraction-scope.md), seen from the other side.

## Consequences

- One engine exists at runtime. The `modality.ts` singleton, the scope stack
  and the attribute on `<html>` have exactly one owner again.
- A bug found through a miralabs-ui component is fixed here and released here.
  miralabs-ui bumps a dependency instead of patching a copy.
- The release order becomes a constraint: a breaking change in
  `@standarx/nav` must ship before the miralabs-ui release that needs it.
- Applications upgrading miralabs-ui across that release must rename any
  `data-mira-nav*` attribute and any `html[data-mira-input]` selector written
  in their own code. That is the cost of the rename, paid once.
- **Open question for the owner — focus-ring defaults.** The plugin moves here
  (254 lines, `wc -l`, 2026-09-18) but its colours, width, radius and z-index
  live in `packages/styles/scss/components/_focus-ring.scss`, which stays in
  miralabs-ui. Shipped as is, the ring is invisible for anyone who is not a
  miralabs-ui user. Three options: ship inline default tokens in the plugin;
  ship a small optional stylesheet; or leave `focus-ring` out of v0 and expose
  only the attributes so consumers style it themselves. Not decided.
- Size budget: the lines that miralabs-ui deletes become lines this repository
  owns, and `scripts/size-budget.ts` here must cover them. That script exists,
  with one line per published entry and every cap still `null`, so the first
  build of `dist/` sets the caps ([ADR-0017](0017-size-budgets.md)). The current
  numbers come from `bun run check:size` in miralabs-ui on 2026-09-18 (min+gzip,
  externals `../*` and `../../*`): input system with intents and engage 1.93 kB
  of a 2.00 kB cap, gamepad engine 2.35 kB of 3.00 kB, spatial engine 2.81 kB
  of 3.00 kB, modality tracker 0.74 kB of 1.00 kB. These are inherited figures,
  measured in the source repository; they are not a measurement of this
  package, which has not been built yet.
- The React adapter (`packages/react/src/input.tsx`, 209 lines, `wc -l`,
  2026-09-18) cannot be moved verbatim: it depends on `useDocument()` from the
  miralabs-ui environment context. Its replacement here takes the document as a
  prop or reads `ownerDocument`, per [ADR-0003](0003-extraction-scope.md).

## Alternatives considered

- **Fork and diverge.** miralabs-ui keeps its copy, standarnav evolves on its
  own. Rejected: it is this decision inverted. Two implementations of a scope
  stack and a modality singleton will disagree within one release cycle, and
  every bug will have to be fixed twice, differently.
- **Keep engage mode and the keymap inside miralabs-ui, publish only the
  engines.** Rejected: `engage.ts` pushes a scope onto the intent bus that
  lives in the extracted `input-system.ts`, and `keymap.ts` feeds its keyboard
  source. Splitting them puts the coupling in the seam between two packages
  instead of removing it.
- **Peer dependency instead of a direct dependency.** Considered and kept as a
  possibility, not a decision for today: it would let an application pin one
  engine version across miralabs-ui and its own code, at the cost of an install
  step for every consumer. Revisit when `@standarx/nav` reaches 1.0.
- **A deprecation period with dual attribute emission.** Rejected as the
  default because it doubles the attribute surface in the DOM and in the SCSS
  for months. Available on request, as stated above.

## Evidence

- `grep -rln "pushEngageScope" packages/core/src --include=*.ts | grep -v test`
  and `grep -rln "isTextEntryTarget" ...`, run in miralabs-ui on 2026-09-18 —
  outputs listed in the Context table.
- `grep -rl "data-mira-nav" packages/core/src --include=*.ts` (excluding
  `src/input/` and tests) → 17 files across the 14 component directories named
  above; `grep -rl "data-mira-input" packages/styles/scss` → the 9 files named
  above. Both run on 2026-09-18.
- `interaction/modality.ts`, 180 lines (`wc -l`, 2026-09-18): ref-counted
  `WeakMap<Document, ModalityState>`, writes the modality attribute on `<html>`.
- `packages/core/src/input/input-system.ts:13-32` (read 2026-09-18) shows the
  system importing `interaction/modality`, `./intent-bus` and `./keymap` — the
  three pieces that must travel together.
- Attribute naming target `data-snav-*` and package name `@standarx/nav`: the
  owner's decisions of 2026-09-18, recorded in
  [ADR-0001](0001-name-scope-and-attribute-prefix.md).
- Inherited size figures: `bun run check:size` in miralabs-ui, 2026-09-18,
  against a `dist` built the same day.
- Source repository state: miralabs-ui at commit `289fa607`, read-only.
