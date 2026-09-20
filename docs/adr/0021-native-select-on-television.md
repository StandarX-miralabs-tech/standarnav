# ADR-0021: A native `<select>` on a television, and what the package offers instead

Status: Accepted
Date: 2026-09-20
Deciders: Wesley Cormier

## Context

`select:not([disabled])` is in `FOCUSABLE_SELECTOR` (`src/tabbable.ts:19`), so the engine treats a
native `<select>` as an ordinary candidate and focuses it like a button. Then A arrives: nothing in
a scope claims it, so `activateFocused` clicks the focused element (`src/input-system.ts:118-132`),
and a closed `<select>` answers a click by opening its options.

On a desktop that is fine — the popup is the browser's own widget and the browser navigates it. On
a television it is not. The options render in a platform menu drawn outside the document: the
engine cannot see the elements, cannot score them, and `document.activeElement` no longer describes
where the user is. The focus has left the surface the engine is responsible for, and the only way
back is whatever the platform decides.

The defect has the property that makes it expensive: **it is invisible where the code is written**.
A developer on a laptop opens the select, arrows through it, presses Enter and sees it work. The
first evidence is on hardware, in a QA pass or a store review.

`multiple`, and `size` above one, are not affected. Those render as a list box inside the document
and the engine moves through their options like any other markup.

## Decision

**Both halves: a diagnostic that names the trap, and a recipe that replaces it.** Detection alone
leaves a developer stuck; a recipe alone is never found by the person who needs it.

**The diagnostic is `scanNativeSelects(root)` in `@standarx/nav/debug`** (`src/debug.ts`), returning
the focusable, popup-opening selects in `root`. It lives in the debug subpath because
[ADR-0010](0010-dev-mode-diagnostics.md) put every diagnostic there and none in the core, so a
production bundle pays nothing for it. It asks the engine's own `isFocusable` rather than
re-deriving focusability, for the reason ADR-0010 gives: a diagnostic that measures something else
is worse than no diagnostic.

It is a scan and **not** a runtime warning. A warning would have to fire from the core, on a path
every consumer pays for, to report a condition that is not wrong yet — a `<select>` on a page that
never runs on a television is fine. And the trap is not reproducible on a developer's machine, so a
warning would fire where it is not needed and stay silent where it is.

**The recipe is a trigger and a list of real focusable elements** (`playground/widgets.ts`,
`attachListbox`), driven by `src/engage.browser.test.ts`. Opening pushes a `trapped` scope and
reveals a container carrying `data-snav-trap`; the options are ordinary buttons the engine
navigates; B closes and returns the focus to the trigger. Nothing leaves the document, so nothing
leaves the engine's sight.

Two mechanics of the bus make that work, and both are easy to get wrong:

- **The trapped scope does not confine the focus.** The spatial engine is pushed as a `base` scope
  (`src/spatial/spatial.ts:506`) and a base scope is asked even through a trap — which is the case
  `base` exists for. Confinement comes from `data-snav-trap` on the container. The scope silences
  the components in between; the attribute is what keeps the engine inside.
- **Inside a trap, A does not click the focused element.** `select` is not one of the three intents
  allowed to escape a trap (`src/intent-bus.ts:90-94`), so a trap that handles nothing still makes
  the dispatch report the intent consumed (`:141-144`), and `activateFocused` stands down. A
  trapped surface has to claim `select` and activate its own focused element. This is pinned by a
  test in `src/input-system.browser.test.ts` rather than left as a comment, because the listbox was
  written assuming the opposite and silently picked nothing.

## Consequences

- A native `<select>` stays focusable and stays clickable. The package does not intercept it, does
  not warn at runtime and does not replace it: an application that wants the native control on a
  desktop keeps it, and one shipping to a television is told by the scan and given a pattern.
- The debug entry is at 0.49 kB against a 0.50 kB cap, 97 % used. The next diagnostic added to it
  needs a cap amendment in [ADR-0017](0017-size-budgets.md) first, by that ADR's rule 4.
- The recipe is a playground recipe, not a shipped component. `attachListbox` is not exported from
  the package and adds nothing to the public surface of
  [ADR-0011](0011-package-layout-and-adapters.md) — this remains a navigation engine, not a
  component library. The cost is that a consumer copies code rather than importing it, which is the
  same trade the other four value-holding controls take.
- `data-snav-trap` is now load-bearing in a documented pattern, which raises the price of changing
  what it means. [ADR-0001](0001-name-scope-and-attribute-prefix.md) already freezes the name at
  v1; this is a second reason.
- Nothing here is verified on a television. The behaviour of the platform popup is reasoned from
  what the engine can observe, not from a device report, and no device test has ever been run
  ([ADR-0014](0014-device-and-browser-matrix.md)). If a runtime turns out to keep the popup inside
  the document, the scan over-reports there and this record is what to revisit.

## Alternatives considered

**A runtime warning from the core**, when a `<select>` is focused or activated. Rejected on where
the cost falls: every consumer pays the bytes and the check, forever, for a message that is only
correct on one class of device. It also cannot be honest — the core does not know it is on a
television, so the warning would either cry wolf on every desktop or need a device check the
package has no way to make.

**Refuse to focus a native `<select>`**, by removing it from `FOCUSABLE_SELECTOR`. Rejected as a
lie about the DOM: the element *is* focusable, Tab reaches it, and an engine whose candidate list
disagrees with the platform's focus order is a worse problem than the popup. It would also break
every desktop application using the package, to fix a television.

**Ship the listbox as `@standarx/nav/select`.** Tempting and deferred rather than refused. It is
new public surface, a size-budget line and a component-shaped API in a package that has none, and
the pattern needs to survive contact with a real television before it is worth freezing. The recipe
is the same code either way; what changes is whether it carries a version number.

**Document the problem and offer nothing.** Rejected: it was the state before this record, and the
[ROADMAP.md](../../ROADMAP.md) item it came from said the decision could not stay open. A package
that claims to handle television navigation and hands back the one control television breaks is
promising something it does not deliver.
