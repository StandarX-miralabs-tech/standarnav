# ADR-0007: Two navigation modes, composite and app

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

A gamepad d-pad and an arrow key produce the same intent — `moveUp`, `moveDown`,
`moveLeft`, `moveRight` — on purpose: a component must never learn which device the
user holds. But the two devices do not have the same rights on a web page, and
pretending they do breaks one of the two worlds.

On a television there is no `Tab` key. The d-pad is the only way to reach anything,
so it must be allowed to cross the whole page: out of a menu, into a rail, down to
a footer.

On an ordinary web page the arrow keys are already taken. The ARIA Authoring
Practices Guide gives them to the composite widget that has focus — a menu, a
listbox, a tab list, a grid, a toolbar — and gives `Tab` the job of moving between
composites. Outside a composite the arrows scroll the page. A library that takes the
arrow keys and turns them into free spatial movement silently breaks both of those
contracts, and it breaks them on the sites where keyboard users are most likely to
be.

The extracted engine already resolves this with a mode. This ADR records why the
default is the conservative one, and what the other mode is for.

## Decision

The spatial engine has exactly two modes, chosen at construction:
`spatialPlugin({ mode })`, default `composite`.

| Mode | Arrow keys (source `keyboard`) | Gamepad / remote |
| --- | --- | --- |
| `composite` (default) | Ignored by the spatial engine. They keep their native meaning: the focused composite handles them, or the page scrolls. `Tab` crosses between composites. | Crosses the whole page. |
| `app` | Same freedom as the gamepad: spatial movement across the page. | Crosses the whole page. |

The mechanism is one line in the intent handler: in `composite` mode, a directional
intent whose `source` is `keyboard` returns `false`. Returning `false` means "not
claimed", and an unclaimed keyboard intent leaves the native `keydown` default
intact — the input system only calls `preventDefault()` when a scope consumed the
intent. So the arrow key reaches the focused component, or the browser, exactly as
if standarnav were not loaded.

The gamepad is not filtered because it has no alternative: there is no `Tab` on a
d-pad, and no native default to fall back on.

`pointerFollowsFocus` follows the mode. It defaults to **on in `app`** and **off in
`composite`** (`options.pointerFollowsFocus ?? mode === "app"`). The reasoning is the
same split: on a TV or kiosk a mouse and a pad fighting over two visible cursors is
the bug; on a web page, moving focus because the pointer passed over an element
would steal focus from a form the user is filling in.

Mode is a property of the engine instance, not of a container: it is read once from
the options at construction and no attribute changes it
(`src/spatial/spatial.ts:238-239`, read 2026-09-20 — `options.mode ?? "composite"`
on one line and `options.pointerFollowsFocus ?? mode === "app"` on the next).

## Consequences

- The default is safe for a regular web page. Adding standarnav to a site changes
  nothing about keyboard behaviour until a gamepad is plugged in.
- APG composites keep working unmodified, because the engine never sees their arrow
  keys. A roving-tabindex menu, a tab list and a grid behave as their own
  implementations decide.
- A TV or kiosk application **must opt in**: `spatialPlugin({ mode: "app" })`. This
  is the one line a TV integrator can forget, so it belongs in the first paragraph
  of the TV guide, not in an options table at the bottom.
- `app` mode takes the arrow keys away from prose scrolling. On a content site that
  is a regression, which is the concrete reason the documentation site of the source
  repository runs `composite`: in `app` mode, <kbd>Down</kbd> would stop scrolling
  the article and start moving focus, on the very site whose readers came to learn
  how the library treats a keyboard.
- Two modes mean two paths through the same handler, so the browser test suite has
  to cover both: a keyboard-sourced `moveDown` must move focus in `app` and must not
  in `composite`. It does, since 2026-09-20 — `src/spatial/spatial.browser.test.ts:138-167`,
  three cases: the arrow keys are left to the composites by default, the gamepad
  crosses the page anyway in `composite`, and `app` gives the arrow keys the run of
  the page.
- `pointerFollowsFocus` had no test in the source repository and was listed as a
  known gap in [ADR-0018](0018-testing-strategy.md). It has three now
  (`src/spatial/spatial.browser.test.ts:512-545`): off in `composite` so a hover
  changes nothing, on in `app`, and bypassing the `onWillMove` veto — which a hover
  is not subject to, and which nothing had pinned before.
- The gamepad crossing composites in `composite` mode is deliberate, and it means a
  d-pad can leave an APG composite that a keyboard cannot leave with arrows. That
  asymmetry is the point, not an oversight: the pad has no `Tab`.

## Alternatives considered

| Option | Why not |
| --- | --- |
| One mode only, always spatial | Breaks APG composites and page scrolling on every ordinary site. It is the TV-library default, and it is why those libraries are only used in TV applications. |
| One mode only, never spatial from the keyboard | Leaves `app`-style products — kiosks, dashboards, car head units, anything driven by a remote that emits arrow key codes rather than gamepad buttons — with no way to get arrow-key spatial movement. Some TV remotes arrive as key codes, not as a `Gamepad`. |
| Per-container mode (`data-snav-mode="app"` on a subtree) | Tempting — a dashboard region inside a content site — but it makes "who owns this arrow key" depend on where focus currently is, which is exactly the ambiguity APG exists to remove. It also interacts badly with the walk out to parent containers: the mode could change mid-move. Revisit only with a concrete use case. |
| Auto-detect: spatial from the keyboard only when no composite has focus | Requires the engine to reliably know what a composite is, from the outside, on markup it does not own. There is no attribute that every APG composite carries. |

## Evidence

- The mechanism, with its comment: "APG-strict by default: arrow keys belong to
  whatever composite has the focus, and only Tab crosses between them. A gamepad has
  no Tab, so it crosses anyway" — `packages/core/src/input/spatial/spatial.ts:428-439`
  (miralabs-ui, commit `289fa607`, read 2026-09-18); the mode test is at `:437`.
- Defaults: `mode` is `composite` and `followPointer` is `options.pointerFollowsFocus
  ?? mode === "app"` — `packages/core/src/input/spatial/spatial.ts:192-193`. The
  option documentation is at `:68-82`.
- The pointer handler that `followPointer` installs, and which focuses on
  `pointerover`: `packages/core/src/input/spatial/spatial.ts:456-472`.
- Unclaimed intents keep the native default: "The native default survives unless
  someone actually wanted the intent — otherwise arrow keys would stop scrolling a
  page that has no navigation", `packages/core/src/input/input-system.ts:159-161`.
- The documentation-site rationale, including the mode table and the sentence about
  <kbd>Down</kbd> on a prose page: `miralabs-ui: apps/docs/content/foundations/gamepad.md:42-55`
  (read 2026-09-18). The same page shows the site's own setup calling
  `spatialPlugin({ mode: "composite" })` at lines 29-35.
- Same intents from both devices, which is what makes the mode the only place the
  source matters: `miralabs-ui: apps/docs/content/foundations/gamepad.md:109-116`, and the
  `select` fallback in `packages/core/src/input/input-system.ts:98-112`.
- ARIA Authoring Practices Guide, keyboard interaction conventions for composite
  widgets (arrow keys inside, `Tab` between):
  https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/ — referenced as the
  rule this ADR follows; not re-fetched on 2026-09-18.
- The same mechanism in this repository, read 2026-09-20: `src/spatial/spatial.ts:480-491`
  — `handleIntent` with the comment quoted above, and the mode test
  `if (mode === "composite" && event.source === "keyboard") return false;` at `:489`.
  Defaults at `:238-239`. The `pointerover` handler `followPointer` installs is at
  `:508-524`, and it checks `isFocusable` and root containment before focusing.
- Coverage: `src/spatial/spatial.browser.test.ts:138-167` (the two modes) and
  `:512-545` (`pointerFollowsFocus`), added since the record was written.
- Related: [ADR-0005](0005-real-dom-focus.md) (what "focused" means) and
  [ADR-0006](0006-declarative-first.md) (what the engine reads from the markup).
