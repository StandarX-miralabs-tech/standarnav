# ADR-0022: The virtual keyboard — layout data, insertion, and what closes it

Status: Accepted
Date: 2026-09-20
Deciders: Wesley Cormier

Nothing is built yet. This is the record the module is to be written against, which is the order
[ROADMAP.md](../../ROADMAP.md) asks for. Two points stood as riders when this was first written —
what `back` does to typed text, and whether the field keeps a visible caret — and the owner settled
both the same day; they are decisions 8 and 9.

## Context

A television has no keyboard. Every text input on one needs an on-screen one, and the package that
moves the focus is the package that has to place it — nothing else knows where the focus is, and a
consumer who writes their own has to reimplement the intent plumbing to do it.

What exists today is the refusal, not the answer. `isTextEntryTarget` decides that an `<input>`,
a `<textarea>`, a `contenteditable` or a `role="textbox"` is a text entry (`src/keymap.ts:151-161`),
and the input system then **drops** every intent aimed at one except `back`, `tabNext`, `tabPrev`
and `contextMenu` (`src/input-system.ts:167-172`, `src/keymap.ts:164-190`). So the arrows move a
caret and Space types a space, and a navigation scope never sees them. That is correct for a
physical keyboard and it is why a television is stuck: the d-pad is dropped too, and there is
nothing to type with.

Three facts about this repository shape what follows.

There is no text-insertion code anywhere. A grep for `beforeinput`, `setRangeText`, `selectionStart`
and `execCommand` across `src/` returns nothing. This module is the first thing here that will
write into a field rather than move focus between fields.

The package declares `"sideEffects": false` (`package.json`), which is what makes an unimported
subpath disappear from a consumer's bundle ([ADR-0010](0010-dev-mode-diagnostics.md) relies on the
same mechanism). Any design where a layout module *registers itself* by being imported is a side
effect, and would either be dropped by a bundler or force the flag off for everyone.

The composition stance is already set, and it is to stand aside: a keydown mid-composition is
ignored outright (`src/input-system.ts:159-161`, `isComposingEvent` at `src/dom/event.ts:24-26`,
which also covers the `keyCode === 229` that older engines report). The package currently lets the
platform own IME entirely.

## Decision

**1. The keys take real DOM focus, like everything else.** The keyboard is a container of real
focusable buttons, navigated by the spatial engine with the intents that already exist. The
alternative — the field keeps focus while a highlighted key moves around — is a virtual cursor, and
refusing exactly that is [ADR-0005](0005-real-dom-focus.md) and half the reason this project
exists. A keyboard that broke the rule for its own convenience would make the rule advisory.

The cost is real: while the keys hold the focus, the field is not `:focus`, so an application's own
focus styling goes dark on the element the user is typing into. The package therefore writes
`data-snav-editing` on the field for as long as the keyboard is open, so an application can style
the editing state without guessing. That is a fifth name written by the engine, in the set
[ADR-0001](0001-name-scope-and-attribute-prefix.md) freezes at v1, and it is named under the same
rule.

**2. It is a plugin, and it opens on `focusin` of a text entry.** `keyboardPlugin(options)` is an
`InputPlugin` (`src/input-system.ts:41-48`): `setup(context)` returns its teardown, and the context
hands it the `doc` to listen on and the `bus` to push scopes onto. This is the shape
`focusRingPlugin` already has (`src/focus-ring/focus-ring.ts:86`), and following `focusin` is what
it already does. The test for "is this a field" is `isTextEntryTarget`, already exported from the
root entry (`src/index.ts:32`) — the keyboard must not have a second opinion about what a text entry
is.

Opening is not automatic in every case, and the option that governs it is `openOn`: `"focus"` for a
television, `"gamepad"` to open only when the modality is a pad, and `"manual"` for an application
that has its own trigger. `"gamepad"` is the default, because a laptop with a physical keyboard
focusing a field must not get an on-screen one in its way.

> **Amended 2026-09-20.** `"activate"` was added and is now the default; `"gamepad"` is not.
> Opening on a focus turned out to mean opening on a *hover*, because `pointerFollowsFocus`
> focuses whatever the pointer crosses. The amendment at the end of this record has the
> reproduction and the reasoning.

**3. A layout is data in its own module, and the consumer passes it in.** There is no registry and
no self-registration.

```ts
export interface KeyboardKey {
  /** What the key shows. The only string a user reads. */
  readonly label: string;
  /** What it types. Absent for an action key. */
  readonly value?: string | undefined;
  /** What it does instead of typing. */
  readonly action?: "backspace" | "space" | "enter" | "shift" | "layer" | "close" | undefined;
  /** The label and value when shift is held. `label` uppercased when absent. */
  readonly shift?: { readonly label: string; readonly value: string } | undefined;
  /** Width in key units; 1 when absent. A space bar is 5, an enter key 2. */
  readonly span?: number | undefined;
  /** Which layer `action: "layer"` switches to. */
  readonly layer?: string | undefined;
}

export interface KeyboardLayout {
  /** Stable, for `data-snav-*` and for an application's own switcher. */
  readonly id: string;
  /** A BCP 47 tag, or several. Documentation and language-matching, never behaviour. */
  readonly languages: readonly string[];
  /** Rows of keys, in reading order. The first layer is the default. */
  readonly layers: Readonly<Record<string, readonly (readonly KeyboardKey[])[]>>;
  readonly initialLayer: string;
}
```

Every field is data. A layout contains no function, no import from the keyboard module and no
behaviour, which is what makes a language contribution a file and a line in a table rather than a
change to the engine — and what lets the shape be validated once, in the keyboard, instead of trusted
per layout.

**4. "A line to an index" is a line in this repository, not a module that imports every layout.**
The ROADMAP's wording is deliberate and easy to misread. Adding `/keyboard/cyrillic` means a file,
an entry in `tsdown.config.ts`, a row in the [ADR-0011](0011-package-layout-and-adapters.md) subpath
table and a size-budget line — four edits, none of them in the keyboard's code. What it must **not**
mean is a `src/keyboard/layouts/index.ts` that imports them all so they can register: that module
would pull every language into any bundle that touched it, and a French application would ship
Cyrillic. The ROADMAP names that outcome as the thing to avoid, and a registry is how it happens.

The subpaths are `@standarx/nav/keyboard` and one per layout — `/keyboard/qwerty`,
`/keyboard/azerty`, `/keyboard/alphabetic` to begin with. `alphabetic` exists because a remote user
hunting for a letter on a QWERTY grid is slower than on an A-to-Z one, and it is the layout a
television application usually wants.

**5. Insertion goes through `beforeinput`, then the mutation, then `input`.** In that order, and the
`beforeinput` is cancelable: an application with a length limit, a mask or a validator gets to
refuse a keystroke the same way it would refuse a physical one, and a keyboard that mutated the
value first would have already lied to it.

The mutation itself is `setRangeText` at the current selection, which keeps the caret where the user
expects and makes backspace a deletion of one character rather than a truncation.

**`contenteditable` is a text entry the keyboard refuses to open on, in v0.** It is one by
`isTextEntryTarget` (`src/keymap.ts:153`), so the keyboard sees it and must decide. Insertion into a
range is straightforward; backward deletion of one character is not — it needs either
`selection.modify`, which is not a standard, or a walk of text nodes to find the previous character
across element boundaries. A keyboard that types but cannot reliably erase is worse than one that
declines, because the user discovers the half only after committing to it. So the keyboard opens on
`<input>` and `<textarea>` and leaves a `contenteditable` alone, and that refusal is a test rather
than a comment.

**This has a known risk and it is not verified here.** A framework that tracks a field's value
outside the DOM may not notice a programmatic mutation followed by a synthetic `input` event; React
is the case that matters, because `@standarx/nav/react` ships. The module is not finished until a
browser test in the React adapter's suite types through the keyboard into a controlled input and
asserts the component's state changed — and if the plain path does not work, the workaround belongs
in the keyboard with a comment naming why, not in every consumer. The `react-floor` CI job
(`.github/workflows/ci.yml:75-101`) makes that testable against the declared peer floor as well as
the current version.

**6. Composition is out of scope for the first version, and the record says what it would take.**
Latin, Greek and Cyrillic layouts type a character per key and need nothing beyond decision 5. A
CJK layout does not: it needs a composition buffer, candidate selection, and `compositionstart` /
`compositionupdate` / `compositionend` events the application and the platform both believe. The
package's current stance is to stand aside from composition entirely
(`src/input-system.ts:159-161`), and reversing that for the keyboard would mean owning IME in a
module that cannot yet type a Latin letter. A CJK layout therefore needs its own ADR, and shipping
one before that record exists is the failure this decision prevents.

**7. Every entry gets a size-budget line, uncapped until measured.** The keyboard entry and each
layout, by [ADR-0017](0017-size-budgets.md) rules 2 and 5: `cap: null` means the first run is red
and prints the number, and the cap is written from that measurement in an amendment there. A layout
is data and should be small; a layout line that is not small is the signal that behaviour leaked
into it.

**8. `back` closes the keyboard and keeps what was typed.** It must close — it is the only "get me
out" button a remote has, and it already escapes a trap by design (`src/intent-bus.ts:122-126`).
Reverting is an application's own Cancel button, and the keyboard carries a `close` action key for
"done".

This is a **deliberate inconsistency with engage mode**, which is the other thing in this package
that holds a value and where B puts the value back (`src/engage.ts:41-42`, `:69-72`). Someone who
learns B-restores on a slider will expect it here and will be wrong. The inconsistency is accepted
because a text field is not a scalar: a slider's value is re-set with one more press of a direction,
and thirty seconds of typing on a remote is not re-entered at all. An accidental B losing it is a
worse outcome than a grammar with one documented exception. So the exception is documented here, in
the ROADMAP, and in whatever user documentation the keyboard ships with — an inconsistency nobody
writes down is just a bug with a rationale.

**9. The keyboard draws no caret, and the field's absence of one is documented.** Decision 1 moves
real focus to the keys, so the field stops being `:focus` and in most engines stops drawing its
caret. `data-snav-editing` is the styling hook and an application draws its own editing state.

The alternative was a caret rendered from `selectionStart`, and it was refused for the reason
decision 1 exists: it is a second source of truth for where the insertion point is, able to disagree
with the field it describes. That is the failure mode of virtual focus, reintroduced for display
instead of for navigation. The honest cost of this choice is that an application which styles
nothing gives the user a field that looks inert while they type into it — a bad default, and one only
visible in use. The mitigation is documentation, not a default style: this package ships no
stylesheet, and [ADR-0020](0020-focus-ring-defaults.md) paid for its one inline-painted default with
a failure mode where an invalid custom property erases the indicator silently. One of those is
enough.

> **Amended 2026-09-21.** Reversed: the keyboard draws a caret, in a preview row at the bottom of
> its own box and never in the field, and the directions move it from that row. The amendment at
> the end of this record has the argument, and what "no caret" still means for the field.

## Consequences

- The keyboard is the second surface in this repository to depend on the two trap mechanics
  [ADR-0021](0021-native-select-on-television.md) recorded, and it will hit both. Confining the
  focus to the keys needs `data-snav-trap` on its container, because the spatial engine is a `base`
  scope and is asked through a trap on purpose. And A on a key must be claimed by the keyboard's own
  scope: inside a trap `activateFocused` stands down, so nothing clicks the focused key for it.
  Whatever the keyboard gets wrong, it will not be these two.
- `data-snav-editing` takes the set of attributes the engine writes from four to five and is frozen
  at v1 with the rest ([ADR-0001](0001-name-scope-and-attribute-prefix.md)).
- A layout is a public data shape, so its type is part of the surface a version number covers
  ([ADR-0012](0012-versioning-and-release.md)). Adding an optional field to `KeyboardKey` is a minor;
  renaming one breaks every third-party layout.
- The keyboard must not be reachable by the spatial engine while closed. It gets there by not
  existing: `open()` creates the container and appends it to `options.container ?? document.body`,
  and `close()` removes it outright, so there is no element to filter between sessions. That is the
  opposite of the listbox recipe, whose list sits in the document from the start and is toggled
  `hidden` — either answer works, and a widget with keys to build per layout has less reason to
  keep a box around.
- An application that already has an on-screen keyboard gets `openOn: "manual"` and a plain refusal:
  two keyboards on one field is worse than none, and the package cannot detect the other one.
- Nothing here has run on a television, and the module that implements it will not have either
  ([ADR-0014](0014-device-and-browser-matrix.md)). The riskiest untested assumption is not the
  typing — it is that a platform's own on-screen keyboard does not also appear, which would put two
  keyboards on the field by no fault of this code.

## Amendment, 2026-09-20: built, and three things the code corrected

The module exists: `src/keyboard/keyboard.ts` with `@standarx/nav/keyboard`, plus
`/keyboard/qwerty`, `/keyboard/azerty` and `/keyboard/alphabetic` as data entries, capped
in [ADR-0017](0017-size-budgets.md). Every decision above survived being implemented.
Three did not survive unchanged, and all three were found by a test rather than by review.

**The React risk decision 5 named was real, and it was on the narrower of the two paths.**
`setRangeText` never touches the `value` property, so React's instance-level tracker still
held the old value when the synthetic `input` arrived and `onChange` fired — the ordinary
case was never in danger. But a field with no selection is assigned `value` directly, and
that is the very property React instruments: its record updated before the event, React
concluded nothing had changed, and the next render put the empty value back, so the field
*visibly rejected the keystroke*. The keyboard now assigns through
`HTMLInputElement.prototype`'s own setter, which leaves the instance record stale. Both
paths are pinned in `src/react/react.browser.test.tsx`, and the workaround is in the
keyboard exactly as decision 5 said it would have to be.

**A field with no selection was not anticipated at all.** `isTextEntryTarget` calls
`type="email"` and `type="number"` text entries, correctly, and neither exposes
`selectionStart`; `setRangeText` throws `InvalidStateError` on them. The first draft would
have thrown on an email field. The keyboard now assigns the whole value on that path,
which is right because such a field has no caret to respect.

**The caret has to be placed on open, and in v0 it can never be moved.** A programmatic
`focus()` leaves the caret at position 0, so the first space typed into a field with
existing text went in front of it. The keyboard now puts the caret at the end — and the
reason that is not merely a default is that the directions navigate the keys, so there is
no gesture left to move a caret with. Caret movement is a v1 item in
[ROADMAP.md](../../ROADMAP.md); until it exists, text can be appended and erased from the
end and nothing else.

One decision is worth restating because implementing it changed how it reads. Decision 3
said a layout contains no function. Spelling twenty-six letters as objects would have been
data too, and heavy, and paid again by every language — so a row may be a **string**, one
key per character, expanded by the keyboard. That keeps the promise literally: `"abcdefg"`
is data, the expansion is paid once, and the layout entries measure 0.36 to 0.49 kB.

## Amendment, 2026-09-20: driven on a real page, which broke three of these decisions

Nothing below was found by a test. The playground was opened in a browser and used, and
the whole chain came apart in the first minute. Two of the decisions above are reversed
and one is narrowed.

**1. `openOn` gains `"activate"`, and it is the default.** The old default was
`"gamepad"`, and the playground passed `"focus"` so a laptop with no pad could reach the
keyboard. That is the bug. The playground arms `mode: "app"`, where
`pointerFollowsFocus` is on, so the pointer focuses whatever it crosses — and a keyboard
that opens on focus is a keyboard that opens on **hover**. Reproduced with a real mouse
move and no click.

The missing idea was that a focus is not a decision. `"activate"` opens on a click on
the field, or on a `select` on it from any device, and never on a focus alone. It is the
default because it is the only value that is safe under a pointer, and because it is
what a `<select>` does. `"focus"` and `"gamepad"` are kept for a surface that wants
them; `"manual"` is unchanged.

`activateFocused` already refused to click a text entry and its comment already said why
— "A belongs to the virtual keyboard" (`src/input-system.ts`). The half that receives
that A was never written. It is written now, as a scope the plugin pushes at setup.

**2. The keyboard paints its own box.** Decision "no default style" above was about the
*field*: no caret, no theme on `data-snav-editing`, and that part stands unchanged. It
was applied to the keyboard's own container, which had no style at all — and an unstyled
`<div>` appended to `document.body` inherits the page's block layout. It drew itself the
full width of the viewport: 1280 by 304 on a 1280 by 800 window, 38% of the screen,
anchored to nothing, over whatever was beneath it.

That is not a missing theme, it is a missing geometry, and no amount of documentation
fixes a widget that has no box. The plugin now carries `KEYBOARD_PAINT` inline the way
[ADR-0020](0020-focus-ring-defaults.md) carries `RING_PAINT`, and places itself against
the field like a menu — below it, flipped above when the room is not there, clamped into
the viewport. Measured after the fix at 492 by 338, 16% of the same window. The size cost
is an amendment to [ADR-0017](0017-size-budgets.md), in its own commit, as rule 4 asks.

Four custom properties are the contract: `--snav-keyboard-z-index` (1600, a rung under
the focus ring so the ring still draws over the key it rings),
`--snav-keyboard-font-size`, `--snav-keyboard-background` and `--snav-keyboard-shadow`.
The failure mode ADR-0020 named — an invalid custom property erasing the declaration
silently — applies here too, and is accepted for the same reason.

**3. Closing no longer always restores the focus, because an open keyboard was eating
the page.** The keyboard's scope is `trapped`. When a `select` arrived and the focus was
*outside* the box, the handler declined it — but a trap makes `dispatch` report the
intent consumed anyway, so the system called `preventDefault` and the browser's own
activation never happened. Every button on the page stopped answering Enter and A while
the keyboard was open. That is the defect behind "the listbox will not open with a pad
or a keyboard".

A focus that leaves the keyboard now closes it. And that close does **not** hand the
focus back to the field: doing so dragged the focus off whatever the user was reaching
for and put it back in the field, so the button they had just moved to never answered
either. `close(restoreFocus)` distinguishes the two, and both halves are pinned by tests.

## Amendment, 2026-09-21: the preview row and the caret — decision 9 reversed, decision 8 kept

The fix above was driven on the real page again, and the owner found it unusable in a minute:
the box sat from 390 to 728 on a 1280 by 800 viewport over a field whose bottom was 716, so the
keys covered the very field they were typing into, and nothing on screen showed what was being
typed. The ask that came out of it was two things — a line in the keyboard that shows the text
being entered, and a way to put the caret in the middle of it to correct a mistake — and both
run into a decision this record took on purpose.

**1. Decision 9 is reversed by name.** The keyboard draws a caret. It draws it in a preview row
at the bottom of its own box: the field's value, one line whatever the value, with a bar where
`selectionStart` says the next character goes. The sentence "the keyboard draws no caret" no
longer holds as written.

Decision 9 refused this on one ground that mattered — "a second source of truth for where the
insertion point is, able to disagree with the field it describes" — and the answer is that the
row is not a source of anything. It is repainted from `field.value` and `field.selectionStart`
after every change and holds no position of its own, which is the relation `data-snav-focused`
has to `document.activeElement` in [ADR-0005](0005-real-dom-focus.md): a hook that mirrors the
real state and is never read back as state. Where the field could disagree with the row, each
case is closed or named:

- A controlled field that transforms what was typed. React re-assigns the transformed value to a
  field that is not focused, and that assignment moves the caret to the end. The plugin repaints
  from an `input` listener on the **document**, which runs after the framework's own listener has
  re-rendered, so the row shows the field as it ends up — value and caret both. Pinned in
  `src/react/react.browser.test.tsx` beside the two cases decision 5 asked for: "mirrors a field
  that transforms what was typed, caret back at the end". No deferral is needed: React 19 has
  flushed by the time the event reaches the document, on all three engines.
- An `input` the keyboard did not produce. The same listener; pinned by "follows an input event
  the keyboard did not produce".
- A value assigned with no event at all. Not seen until the next keystroke or caret move. Named
  here rather than papered over: watching `value` would need a poll, and a poll is not a mirror.

What "no caret" still means for the field is unchanged. The field is not `:focus` while the keys
hold the focus, the package injects nothing into it and overlays nothing on it, and it ships no
field styling: `data-snav-editing` is still the only field-side hook, and the row is not a
substitute for styling it. The caret in the row dies with the row — `close()` removes the box —
and the field is left holding exactly the selection the user last set.

Decision 9's second ground, that [ADR-0020](0020-focus-ring-defaults.md)'s one inline-painted
default was "enough", was overtaken by the box paint of the amendment above. This amendment says
so rather than stepping past it: the row is painted inline on the same terms, and carries the
same accepted failure mode — an invalid custom property erases a declaration silently.

**2. The caret moves without a mode, so decision 8 stands.** The row spans the whole box, so
nothing is to its left or to its right. While the row has the focus, left and right therefore
move the caret one character, `home` and `end` go to the ends of the line, `pageUp` and
`pageDown` to the ends of the value, and up and down move a line in a textarea — on the first
and last line they hand over to the engine, which is how the focus leaves the row. `select` on
the row does nothing. `back` keeps the one meaning it has everywhere inside the keyboard: close
and keep.

The alternative was the engage grammar every value-holding control uses — A takes hold, the
directions adjust, B lets go — and it was measured before being rejected: with an engage scope
pushed above the keyboard's trapped scope, `back` released the hold and left the keyboard open,
and it took a second `back` to leave (chromium, firefox and webkit, 2026-09-20). That is a
second meaning for B inside one surface, which decision 8 exists to refuse; it would also have
put `engage.js` into the keyboard's size-budget line, and a held state that a user reads from
three metres away needs a paint of its own. A caret is a position, not a value: there is nothing
for B to put back. The ROADMAP had named "a modifier key in the layout, or a held direction" as
the gesture this needed; a row with nothing beside it needed neither.

**3. Where the field exposes no selection, the plugin owns the caret.** `email` and `number`
inputs report `selectionStart` as `null` and throw on `setSelectionRange`; the amendment above
appended to them and erased from the end. Now the plugin keeps an index for such a field for as
long as the keyboard is open, clamped to the value's length on every read, and splices insertions
and deletions around it on the whole-value path that already existed. This is not the second
source of truth decision 9 refused: the field has no position to mirror, so the row is the only
one there is, and it is gone when the keyboard closes. When the field is focused again by a
physical keyboard, its own caret is wherever the platform puts it.

The branch is decided by `selectionStart === null` at runtime, per field, and never by the
input's `type`: WebKit gives `<input type="date">` a working selection where Chromium and
Firefox throw `InvalidStateError` (probed 2026-09-20 on the three engines). A date field on
WebKit therefore gets the field's own caret and on the other two the plugin's, and that is a
browser fact this package mirrors rather than hides.

**4. The facts that make the mirror legal under decision 1.** `setSelectionRange` on a field
that does not have the focus moves the caret, moves no focus and fires no focus event; the
selection set on a blurred field survives its refocus. Both on chromium, firefox and webkit
(2026-09-20). This matters because the plugin closes the keyboard on any `focusin` that leaves
its box: a caret move that stole the focus back to the field would have closed the keyboard on
every press. Pinned by "moves the field's own selection with left and right" — which asserts
`document.activeElement` is still the row afterwards, in ADR-0005's own gate wording — and by
"leaves the field with the caret the row set when the focus goes back".

**5. What the row shows, and what it is.** A newline is drawn as one glyph, `↵`, so the row is
one line high whatever the value and every index of the value is one character of the row. A
password is drawn as bullets. The row is kept out of the box's `max-content` width
(`width: 0; min-width: 100%`), so a long value scrolls inside it instead of widening the
keyboard — the full-bleed defect the box paint was added to fix would otherwise come straight
back — and the caret is scrolled into view after every paint. The row is a focusable `<div>`
with no role: `role="textbox"` would make `isTextEntryTarget` call it a text entry and the input
system would drop the directions before the keyboard's scope saw them. Its accessible name is
its text, bullets for a password; the field, which is still the element holding the value, is
where assistive technology reads it. The box gains a fifth custom property,
`--snav-keyboard-color` (`#f4f4f5`): it declared a background and no colour, so on a light page
it painted the page's near-black text onto its own near-black box — the keys were unreadable
and a text-only row would have been invisible.

**6. Two defects found on the way, on all three engines.** Neither is a consequence of this
design; both were in the way of it.

- Re-rendering the keys on shift or a layer switch was `replaceChildren` on the box. The focused
  key was destroyed, the focus fell to `document.body`, and the next direction walked out of the
  keyboard — onto an unrelated button on chromium and webkit, back onto the field on firefox.
  Worse, with the focus outside the box the keyboard's own scope declined every `select` while
  the trap still swallowed it, so the keyboard stopped answering A until the user escaped. The
  keys now live in a host of their own, the row is built once and painted in place, and
  `render()` puts the focus back on the key at the same row and column. Pinned by "keeps the
  focus on the key at the same position through shift" and "keeps the preview row through a
  layer switch".
- The overlap itself was the playground's stylesheet, not the plugin's placement. A
  `[data-snav-keyboard]` rule from before the box painted itself set `inset: auto 0 72px 0`; the
  plugin wrote `top` and `left` inline and nothing else, so the stylesheet's `bottom: 72px` kept
  applying and stretched the box from the plugin's `top` down to 72 px above the bottom — 390 to
  728. The rule is gone (the playground styles keys, never the box) and the plugin now writes all
  four insets, pinned by "owns all four insets, so a stylesheet cannot stretch it over the
  field". The figure "492 by 338, 16% of the viewport" in the amendment above and in
  [ADR-0017](0017-size-budgets.md) was measured *through* that rule — 338 is 800 − 390 − 72 —
  and is corrected here: with the playground's 44 px keys the box measures 492 by 335 and sits
  from 356 to 691, above a field at 695 to 716, no overlap (chromium, 1280 by 800, 2026-09-21;
  firefox 355 to 690, webkit 358 to 690, same page). The size depends on how a page styles the
  keys, which is why it is quoted with the page.

**7. What is still missing, said out loud.** No clear-all: erasing a forty-character email is
forty presses. No forward delete: the caret sits between characters and `⌫` removes the one
before it. No selection: a range the application set is drawn as a caret at its start and the
next key edits the range — the keyboard never creates one, since `open()` collapses the caret to
the end, which was true before and is user-visible now. No feedback when an application cancels
`beforeinput`: the row does not change and the user presses again. And up from the row lands on
the key nearest the row's centre, not on the key the user came from. All five are ROADMAP items.

**Names, size, tests.** The box, its rows, the preview row and the caret carry
`data-snav-keyboard` (the layout id), `data-snav-keyboard-row`, `data-snav-keyboard-preview` and
`data-snav-keyboard-caret`, declared as constants in `src/keyboard/keyboard.ts` and recorded in
[ADR-0001](0001-name-scope-and-attribute-prefix.md) by an amendment of the same day, together
with the five custom properties. The keyboard line measures 2.82 kB min+gzip against its 2.25 kB
cap; the cap is raised to 3.00 kB by an [ADR-0017](0017-size-budgets.md) amendment in its own
commit before the code, as rule 4 asks. Sixteen browser tests were added across
`src/keyboard/keyboard.browser.test.ts` and `src/react/react.browser.test.tsx`, and the test
"puts the caret at the end on open, because nothing can move it afterwards" is renamed, because
something can.

## Alternatives considered

**A highlighted key with the field keeping focus.** Rejected, and it is the design most television
libraries use. It keeps the caret blinking and the field styled, which is genuinely nicer — and it
is a virtual cursor, with every cost [ADR-0005](0005-real-dom-focus.md) enumerates: a screen reader
is told nothing, the highlighted key is not the active element, and any other library that moves
focus now disagrees with this one.

**A global layout registry with self-registering modules.** Rejected on `sideEffects: false` and on
the outcome: it is how a French application ends up shipping Cyrillic. It also makes the layout in
use a piece of global state, so two independent input systems on one page could not use different
layouts.

**One layouts module with every layout in it.** Rejected for the same bundle reason, and it is the
shape the ROADMAP explicitly rules out. It would be simpler to write and simpler to document, which
is what makes it tempting.

**Layouts as functions rather than data.** A layout that could compute its rows would make a
phone-style multi-tap or a predictive layout expressible. Rejected for now: it moves behaviour into
the contribution a language PR is supposed to be, and every such layout becomes code to review
rather than data to validate. The data shape can gain a function later; a function shape cannot be
made data.

**`document.execCommand("insertText")` for the mutation.** It fires `beforeinput` and `input`
natively, which would remove the whole framework-tracking risk of decision 5 in one line. Rejected
on being deprecated with no replacement that does the same thing, and unspecified across engines for
`contenteditable`. Worth re-testing before the module ships: if the three-step path turns out to
need a framework-specific workaround, a deprecated API that does not is a real trade and this is
where to record having considered it.

**Ship the keyboard without a plugin, as a component the application mounts.** Rejected: it would
need the bus, the modality and the focus target passed in by hand, which is the plumbing a consumer
is meant to be spared. Being a plugin is also what lets it open on `focusin` without the application
wiring a listener.
