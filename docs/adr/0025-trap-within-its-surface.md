# ADR-0025: A trap still asks what lies inside its surface, when both say so

Status: Accepted
Date: 2026-09-23
Deciders: Wesley Cormier

## Context

The intent bus decides by push order and nothing else. Up to this record, once a `trapped` scope
declined an intent, `dispatch` skipped every scope beneath it that was not `base`
(`if (trapped && !scope.base) continue;`, line 137 of `src/intent-bus.ts` at 2534f0a). That is
right about the page under a modal and wrong about the modal's own content, because of the order
a framework opens scopes in: a child's effect runs before its parent's. React asserts that order
here — "keeps a nested composite under the trap of the dialog around it" in
`src/react/react.browser.test.tsx` expects the inner scope opened first. Whether Vue, Svelte and
Angular do the same is not measured yet here; the first parity case of decision 8 is where each of
their adapters will measure it. So a radio group mounted in the same commit as the dialog around
it is pushed first, lands under the dialog's trap, and the dialog silences its own content.
[Issue #14](https://github.com/StandarX-miralabs-tech/standarnav/issues/14) reported it on 0.1.0.

It was re-measured on 2026-09-23 against main at 2534f0a, on the real playground in chromium,
firefox and webkit: a dialog and a radio group pushed in that commit order, a real ArrowDown, and
only the dialog was asked; the radio group never moved (Evidence). The parity suite could not see
it: `src/adapter-parity.ts` described "two nested scopes", but the React harness mounted them side
by side, in the tree and in the DOM.

The issue offered two orders, containment in the DOM or open order. Neither is what was decided.

## Decision

**1. `within`, an opt-in option on `IntentScopeOptions`** (`src/intent-bus.ts:66`). It is an
`Element`, or a getter `() => Element | null | undefined` read at every dispatch, because every
adapter only has its element after its first commit — a React ref, a Vue template ref, Svelte's
`bind:this`, Angular's `ElementRef`. A getter answering nothing means no element.

**2. The rule.** When a trapped scope that declined names its surface through `within`, a
non-`base` scope beneath it whose own `within` lies inside that surface (`Node.contains`, so the
surface itself counts) is still asked (`src/intent-bus.ts:177`). A scope with no `within`, or one
outside the surface, stays silenced. A trap with no `within` is the trap it always was. `base`
scopes are asked as before, and the three escapes — `back`, `tabNext`, `tabPrev` — are unchanged.

**3. Several traps.** Every trap the walk asks sets the surface to its own `within`
(`src/intent-bus.ts:192`). The first trap met defines it; beneath it, another trap is only asked
when it lies inside that surface, and then it narrows the surface to its own. So a dialog opened
over another, portalled or nested in its DOM, confines to itself and silences the first one's
content; and a dialog nested in another and opened in the same commit — the outer on top — lets
the inner dialog through, whose narrower surface then silences the outer dialog's composite.

**4. Containment does not reorder the stack.** A contained scope beneath the trap is asked
*after* the trap. A dialog that claims `back` gets it before a composite mounted in its commit,
and a dialog that claimed the arrows would starve its own composite: the recipe claims only what
the dialog owns. Reordering was rejected because the stack order is the one thing every other
guarantee rests on — a menu opened over a dialog stays above it, and #13's registry keeps open
order across a rebuild — and a DOM order would move with every portal and could not be opt-in.

**5. `base` keeps its meaning.** Its doc comment and the file header of `src/intent-bus.ts` said
a component is what a trap silences; they now say so unless it lies inside the surface and both
say so. Telling a composite to pass `base` instead would let it through every trap, its own or not.

**6. Engage mode passes no element.** `pushEngageScope` opens its scope on the user's A, after the
dialog the control sits in, so the trap is beneath it and never in the way; it takes no element
today, and adding one would be API with nothing to fix. Pinned by "adjusts inside a trapped dialog
with no `within`, because A opens it above the trap" in `src/engage.test.ts`.

**7. React.** `useIntent` accepts `within` as an element, a getter or a ref
(`UseIntentOptions`, `src/react/react.tsx:258`). It is read through one getter held for the life
of the component (`:286`), so a new arrow per render, or a ref filled after the first commit,
never re-opens the scope; a change of `trapped` or `base` re-opens in place as #13 made it, carrying
that getter (`:324`). `useIntentScopeHost().pushScope` forwards options as given, so a machine
passes `() => ref.current`.

**8. The parity suite.** `ParityTree` gains `outerTrapped`, `nested` and `within`
(`src/adapter-parity.ts:66-78`), the React harness nests the two elements in every shape, and two
cases pin both halves: "asks a composite nested in a trapping surface when both pass their
element" (`:207`) and "keeps silencing that composite when neither scope passes its element"
(`:220`).

## Consequences

- Non-breaking: nothing changes for a scope that does not pass `within`. It is a `feat`, so the
  next release is 0.3.0.
- The Dialog recipe of the React page passes `within: ref` on the trap, and a composite inside it
  passes its own. [ADR-0021](0021-native-select-on-television.md)'s listbox passes none, and its
  amendment of this date says why nothing changes for it.
- `within` does not confine the spatial engine: `data-snav-trap` still does. A contained scope is
  one more component answering inside the modal, not a second confinement.
- `Node.contains` does not cross a shadow root, consistent with
  [ADR-0008](0008-shadow-dom.md): a scope inside a shadow tree names its host.
- Bytes (`bun run build && bun run check:size`, 2026-09-23): core 3235 to 3290 bytes min+gzip
  against a 3328-byte cap, 38 left; of that, the getter form costs 9 (3281 with an element only).
  React adapter 1396 to 1450 of 1536. No cap moved.
- Specification R4 is amended by this record.

## Alternatives considered

| Option | Why not |
|---|---|
| **Order the stack by DOM containment** (the issue's first proposal) | Changes the order for every consumer, cannot be opt-in, moves with every portal, and needs the DOM on every dispatch. |
| **Keep open order and make the composite open later** (the second) | Open order is already the rule, and it is the defect: a child opens first. Deferring each child to a later tick is per-framework timing, and any rebuild would undo it. |
| **Confine every trap to its component's element, no option** | Breaks every existing dialog, and the core holds no element to confine to. |
| **A composite passes `base`** | `base` goes through every trap, its own or not: a page composite would answer inside a modal. |
| **An element only, no getter** | 9 bytes smaller, but every adapter would have to re-open the scope once its element exists, which moves it above whatever opened since — the defect #13 fixed. |
| **Containment across shadow roots** | Bytes for a case [ADR-0008](0008-shadow-dom.md) puts out of scope for v0. |

## Evidence

- Code: `src/intent-bus.ts:66` (`within`), `:136-138` (`resolve`), `:169` (`surface`), `:177`
  (the skip), `:190-193` (every trap asked sets the surface); the `base` comment at `:53-59` and
  the header paragraph at `:28-36`. React: `src/react/react.tsx:258-267`, `:286-293`, `:324`.
- Tests: `src/intent-bus.browser.test.ts`, thirteen cases from `:37` — contained, claiming, the
  surface itself, outside, trap without `within`, scope without it, getter read at dispatch,
  getter answering null, `base`, the escapes, and three for nested traps (`:183`, `:200`, `:218`).
  `src/react/react.browser.test.tsx:619` onwards: a radio group mounted with its dialog, its
  `within` as a ref, a getter and an element (`:723`), silenced without one (`:739`), and no
  re-open for a new arrow per render (`:748`). `bun run test` → 415 passed, 1 skipped in 25 files
  on 2026-09-23; `SNAV_BROWSER=firefox bun run test:browser`, and the same with `webkit`, → 304
  passed, 1 skipped in 14 files each, the same day. The React peer floor, reproduced on a copy of
  the tree with `bun add --dev react@^18.3.1 react-dom@^18.3.1 @types/react@^18.3
  @types/react-dom@^18.3` as the CI job does: `bun run typecheck` green and the chromium browser
  suite at 304 passed, 1 skipped, on 2026-09-23, after one test ref was typed mutable for 18's types.
- Red first, 2026-09-23, before the implementation:
  `bun x vitest run --project browser src/intent-bus.browser.test.ts src/react/react.browser.test.tsx`
  → 12 failed, 44 passed (56), eight in the bus file and four in the React one; the parity case read
  `expected [ 'outer:moveDown' ] to deeply equal [ 'outer:moveDown', 'inner:moveDown' ]`.
- Real page, 2026-09-23: the playground served by `bun x vite playground --port 5190
  --strictPort`, a dialog holding a radio group injected and both scopes pushed through
  `window.snav.input` in commit order, a real ArrowDown from Playwright. At 2534f0a: only
  `dialog:moveDown` asked, the first radio still checked, on chromium, firefox and webkit. With
  this change: `dialog:moveDown` then `radiogroup:moveDown`, the second radio checked, on all
  three; the same page with no `within` passed: only the dialog, as before.
