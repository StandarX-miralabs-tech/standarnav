# ADR-0021: A native `<select>` on a television, and what the package offers instead

Status: Accepted
Date: 2026-09-20
Deciders: Wesley Cormier

## Context

`select:not([disabled])` is in `FOCUSABLE_SELECTOR` (`src/tabbable.ts:19`), so the engine treats a
native `<select>` as an ordinary candidate and focuses it like a button. Then A arrives: nothing in
a scope claims it, so `activateFocused` clicks the focused element (`src/input-system.ts:119-133`),
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
  (`src/spatial/spatial.ts:510`) and a base scope is asked even through a trap — which is the case
  `base` exists for. Confinement comes from `data-snav-trap` on the container. The scope silences
  the components in between; the attribute is what keeps the engine inside.
- **Inside a trap, A does not click the focused element.** `select` is not one of the three intents
  allowed to escape a trap (`src/intent-bus.ts:122-126`), so a trap that handles nothing still makes
  the dispatch report the intent consumed (`:190-196`), and `activateFocused` stands down. A
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

## Amendment, 2026-09-22: the third way was not to open it

The decision stands and gains a case it did not consider. Reported from the page, twice, by
someone driving it rather than reading it: the native `<select>` still did not work, and being
told so on screen is not the same as it working.

**What the record got right.** Everything about the popup. It renders outside the document, the
engine cannot see it, `document.activeElement` stops describing where the user is, and on a
television the way back is whatever the platform decides. Driven on a real page on 2026-09-22 the
failure is worse than the Context describes: the arrows move the selection inside the popup with
**nothing on the page reflecting it**, and Escape — the one key that gets out — *commits* the move
instead of undoing it, so the user leaves with a value they never chose. With a pad it is not
awkward, it is nothing at all: `activateFocused` reaches the element with `.click()`, and a click
is exactly what opens the surface the engine then loses.

**What it missed.** Context and Decision both reason from "the popup is unreachable" to "the
control is unreachable", and the step between them does not hold. The popup is only reached
because something opens it. A scope that claims `select` while the element is focused means
nothing opens it: `activateFocused` runs only for an unconsumed `select`
(`src/input-system.ts:119-133`), and the keydown handler calls `preventDefault` on the key that
carried a consumed intent, in capture, before the browser acts (`src/input-system.ts:183`). So A
takes hold of the `<select>` the way it takes hold of a slider, the directions move
`selectedIndex` in place, B restores the entry value and A keeps it. A closed `<select>` paints
its own selected option, so the feedback the popup would have given is already on screen.

**What changes.** The playground attaches `attachNativeSelect` (`playground/widgets.ts`), and the
page no longer carries a label describing a trap it cannot escape. The two halves of the original
decision are untouched: the diagnostic still ships, and the replacement listbox is still the better
control for a list long enough to want a scroll or a filter — this recipe shows one row at a time,
which is what a closed `<select>` is.

**What this leaves open.** `scanNativeSelects` reads the DOM, and an engage scope leaves no mark on
the DOM until the instant it is held, so the scan cannot tell a `<select>` with a recipe from one
without and reports both. The playground filters its own by hand (`playground/main.ts`). Making the
diagnostic tell them apart needs a convention — an attribute a recipe writes on attach — and that
is a public surface decision plus bytes in a `debug` subpath measured at 0.49 kB against a 0.50 cap,
so it is named here and not taken.

## Amendment, 2026-09-22 (second): a dropdown has to drop something down

The amendment above was right about the mechanism and wrong about the product, and it was
reported the same day by the same person driving the same page: *the other options can be
selected, but the dropdown does not open, which is strange — with a pad as with a keyboard.*

It was strange. Claiming `select` and stepping `selectedIndex` in place does make a native
`<select>` respond to a pad, and it leaves the user looking at a control that changes its own
label with no list anywhere. The options cannot be seen, only guessed one press at a time, and
the state "this control is now listening to the directions" is carried by a dashed outline and
nothing else. Three options hide that; thirty make it unusable. The first amendment reasoned
from "the popup is not needed to change the value", which is true, to "a list is not needed",
which does not follow — the list is not how a `<select>` stores a value, it is how a `<select>`
is read.

**What ships now.** `attachNativeSelect` opens a list of real elements in the document, built
from the `<option>`s the element already carries and rebuilt on every open, since an application
may refill a `<select>` between two openings. It is the mechanism `attachListbox` already used —
a `trapped` scope, `data-snav-trap` on the list for the confinement a base scope cannot give, and
the scope clicking the focused option itself because `select` cannot escape a trap — with the
`<select>` itself as the trigger rather than a `<button>`. The element stays in the document and
stays the value, so a form submits it and an application that never attaches this still gets the
platform's own control.

The pointer is intercepted as well, on `mousedown` because the popup opens on the press. Letting
a mouse open the platform popup while a pad opens this list would ship two different controls
wearing one element. Alt+Down is intercepted too: it is the documented shortcut for opening a
`<select>`, and the keymap drops anything carrying a modifier (`src/keymap.ts:111-113`), so it
never reaches a scope to be claimed and would have opened the popup behind the engine's back.

**What this costs.** The two controls in the playground now differ less than the original
Decision implied — both open a list of real elements — and that is the honest outcome rather than
a regrettable one. What still separates them is ownership: one augments a native form control,
the other is markup an application wrote. The list also renders below its trigger with no
flip-up when it would overflow the viewport, which is visible on this page with the footer in the
way. That is a positioning problem, not a navigation one, and it is named here rather than fixed.

## Amendment, 2026-09-23: `within` changes nothing for these lists

[ADR-0025](0025-trap-within-its-surface.md) lets a trap that names its surface through `within`
still ask a scope beneath it whose own `within` lies inside that surface. Both lists here push
their trap with `{ trapped: true }` and no `within` (`playground/widgets.ts:277`, `:488`), so they
silence exactly what the Decision above says they silence. Naming the list would change nothing
either: each trap is pushed on the user's A, above every scope already open, and nothing inside
the list opens a scope of its own — its options are plain buttons the `base` engine moves through.
