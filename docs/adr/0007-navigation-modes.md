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

The engine resolves this with a mode. This ADR records why the default is the
conservative one, and what the other mode is for.

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
(`src/spatial/spatial.ts:238-239` — `options.mode ?? "composite"` on one line and
`options.pointerFollowsFocus ?? mode === "app"` on the next).

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
  is a regression, which is the concrete reason a documentation site for this library
  must itself run `composite`: in `app` mode, <kbd>Down</kbd> would stop scrolling the
  article and start moving focus, on the very site whose readers came to learn how the
  library treats a keyboard.
- Two modes mean two paths through the same handler, so the browser test suite has
  to cover both: a keyboard-sourced `moveDown` must move focus in `app` and must not
  in `composite`. It does — `src/spatial/spatial.browser.test.ts:203-232`, three
  cases: the arrow keys are left to the composites by default, the gamepad crosses
  the page anyway in `composite`, and `app` gives the arrow keys the run of the page.
- `pointerFollowsFocus` was recorded as a known coverage gap in
  [ADR-0018](0018-testing-strategy.md) — a default-on path with nothing pinning it.
  It has three tests now (`src/spatial/spatial.browser.test.ts:577-610`): off in
  `composite` so a hover changes nothing, on in `app`, and bypassing the `onWillMove`
  veto — which a hover is not subject to.
- The gamepad crossing composites in `composite` mode is deliberate, and it means a
  d-pad can leave an APG composite that a keyboard cannot leave with arrows. That
  asymmetry is the point, not an oversight: the pad has no `Tab`.

## Amendment, 2026-09-22: one attribute may now *source* the mode, on one element, before the engine exists

The Decision above says the mode "is read once from the options at construction and no
attribute changes it", and the table of alternatives below rejects a per-container
`data-snav-mode="app"`. Both sentences were written when nothing in the package read
such an attribute, and nothing did until today. The vanilla auto-mount helper
([ADR-0023](0023-vanilla-auto-mount.md)) now reads `data-snav-mode` off the root element —
`document.documentElement` by default — and passes the parsed value to the plugin factory the
caller supplied. This record says what that does and does not change.

**The rejection stands, in full.** What the table rejects is a *per-container* mode: a mode
that depends on where the focus currently is, that can change mid-move as the walk goes out to
a parent, and that reintroduces the "who owns this arrow key" ambiguity APG exists to remove.
None of that is touched. `data-snav-mode` is read on one element, once, and only by a helper
that has not yet constructed anything; no container carries it, no walk consults it, and no
running engine watches it.

**"No attribute changes it" is still true, and is the precise wording that survives.** The
attribute does not *change* the mode — it *sources* the option, at construction, in the place
where a caller would otherwise have typed a string. `spatialPlugin` is untouched: it still
reads `options.mode ?? "composite"` on one line (`src/spatial/spatial.ts:238-239`) and still
has no idea an attribute exists. A consumer calling `createInputSystem` directly sees no
change at all.

**Why the default had to be the conservative one here too.** `readMode` returns `app` only for
the exact string `app` (`src/auto/auto.ts:65-67`): a typo, an empty value, `APP`, or a missing
attribute all give `composite`. A helper that guessed generously would hand a content site the
one mode this record spends its Consequences warning content sites away from, and it would do
it from a markup typo.

**What this costs.** `data-snav-mode` is the first `data-snav-*` name that only a helper reads.
A page that sets it and never calls `autoMount` gets silence — no warning, no effect. That is
the price of keeping the engine free of it, and it is named here rather than discovered.

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
  no Tab, so it crosses anyway" — `handleIntent` in `src/spatial/spatial.ts:484-495`;
  the mode test `if (mode === "composite" && event.source === "keyboard") return
  false;` is at `:493`, one line, the whole of the filter.
- Defaults: `mode` is `composite` and `followPointer` is `options.pointerFollowsFocus
  ?? mode === "app"` — `src/spatial/spatial.ts:238-239`. `SpatialPluginOptions`
  documents which world each mode is for at `:73-87`.
- The pointer handler that `followPointer` installs, which focuses on `pointerover`
  and checks `isFocusable` and root containment before it does:
  `src/spatial/spatial.ts:512-528`.
- Unclaimed intents keep the native default: "The native default survives unless
  someone actually wanted the intent — otherwise arrow keys would stop scrolling a
  page that has no navigation", `src/input-system.ts:179-181`.
- Same intents from both devices, which is what makes the mode the only place the
  source matters: `ArrowUp`…`ArrowRight` become `moveUp`…`moveRight` in
  `src/keymap.ts:48-51`, the stick sectors become the same four intents in
  `MOVE_INTENTS`, `src/gamepad/gamepad.ts:67-70`, and the d-pad buttons reach them
  through the `STANDARD` button table, `src/gamepad/mapping.ts:31-34`. The `source`
  the mode branches on is stamped in `resolveKeyIntent` (`src/keymap.ts:128`), and the
  `select` fallback that clicks the focused element for a pad but never for a
  keyboard is `activateFocused`, `src/input-system.ts:118-132`.
- ARIA Authoring Practices Guide, keyboard interaction conventions for composite
  widgets (arrow keys inside, `Tab` between):
  https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/ — the external rule
  this ADR follows.
- Coverage: `src/spatial/spatial.browser.test.ts:203-232` (the two modes) and
  `:577-610` (`pointerFollowsFocus`).
- Related: [ADR-0005](0005-real-dom-focus.md) (what "focused" means) and
  [ADR-0006](0006-declarative-first.md) (what the engine reads from the markup).
