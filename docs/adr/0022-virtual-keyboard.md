# ADR-0022: The virtual keyboard — layout data, insertion, and what closes it

Status: Proposed, two riders for the owner
Date: 2026-09-20
Deciders: Wesley Cormier

Two points are left for the owner and marked **(O1)** and **(O2)** below: what `back` does to text
already typed, and whether the field keeps a visible caret while the keys hold the focus. Everything
else here is decided. Nothing is built yet — this is the record the module is to be written against,
which is the order [ROADMAP.md](../../ROADMAP.md) asks for.

## Context

A television has no keyboard. Every text input on one needs an on-screen one, and the package that
moves the focus is the package that has to place it — nothing else knows where the focus is, and a
consumer who writes their own has to reimplement the intent plumbing to do it.

What exists today is the refusal, not the answer. `isTextEntryTarget` decides that an `<input>`,
a `<textarea>`, a `contenteditable` or a `role="textbox"` is a text entry (`src/keymap.ts:151-161`),
and the input system then **drops** every intent aimed at one except `back`, `tabNext`, `tabPrev`
and `contextMenu` (`src/input-system.ts:166-171`, `src/keymap.ts:184-190`). So the arrows move a
caret and Space types a space, and a navigation scope never sees them. That is correct for a
physical keyboard and it is why a television is stuck: the d-pad is dropped too, and there is
nothing to type with.

Three facts about this repository shape what follows.

There is no text-insertion code anywhere. A grep for `beforeinput`, `setRangeText`, `selectionStart`
and `execCommand` across `src/` returns nothing. This module is the first thing here that will
write into a field rather than move focus between fields.

The package declares `"sideEffects": false` (`package.json:26`), which is what makes an unimported
subpath disappear from a consumer's bundle ([ADR-0010](0010-dev-mode-diagnostics.md) relies on the
same mechanism). Any design where a layout module *registers itself* by being imported is a side
effect, and would either be dropped by a bundler or force the flag off for everyone.

The composition stance is already set, and it is to stand aside: a keydown mid-composition is
ignored outright (`src/input-system.ts:158-160`, `isComposingEvent` at `src/dom/event.ts:24-26`,
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
the editing state without guessing. That is a tenth attribute in the set
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
expects and makes backspace a deletion of one character rather than a truncation. For a
`contenteditable`, the same three-step shape applies to the target range.

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
(`src/input-system.ts:158-160`), and reversing that for the keyboard would mean owning IME in a
module that cannot yet type a Latin letter. A CJK layout therefore needs its own ADR, and shipping
one before that record exists is the failure this decision prevents.

**7. Every entry gets a size-budget line, uncapped until measured.** The keyboard entry and each
layout, by [ADR-0017](0017-size-budgets.md) rules 2 and 5: `cap: null` means the first run is red
and prints the number, and the cap is written from that measurement in an amendment there. A layout
is data and should be small; a layout line that is not small is the signal that behaviour leaked
into it.

### (O1) What `back` does to text already typed

`back` must close the keyboard — it is the only "get me out" button a remote has, and it already
escapes a trap by design (`src/intent-bus.ts:90-94`). What it does to the text is the open question,
and the two answers are both defensible:

- **Close and keep.** The text is in the field and the user can see it; reverting what is visibly
  typed is the more surprising of the two. Reverting is then an application's own Cancel button.
- **Close and revert**, recording the entry value on open, the way `pushEngageScope` does for a
  slider (`src/engage.ts:41-42`, `:69-72`). Consistent with the other control that holds a value,
  and a user who learns B-restores on a slider would expect it here.

They cannot both be right and the difference is visible to anyone who uses both. The recommendation
is **close and keep**, with an explicit `close` action key for "done" and reverting left to the
application — a text field is not a scalar, and an accidental B after thirty seconds of typing on a
remote is a worse outcome than an inconsistency with the slider.

### (O2) Whether the field keeps a visible caret

Decision 1 moves real focus to the keys, so the field's caret stops blinking and, in most engines,
stops being drawn. The options are to leave it — the `data-snav-editing` attribute is the styling
hook and an application can draw its own — or to have the keyboard maintain a rendered caret from
`selectionStart`, which is more work and a second thing that can disagree with the field. The
recommendation is to leave it and document it.

## Consequences

- The keyboard is the second surface in this repository to depend on the two trap mechanics
  [ADR-0021](0021-native-select-on-television.md) recorded, and it will hit both. Confining the
  focus to the keys needs `data-snav-trap` on its container, because the spatial engine is a `base`
  scope and is asked through a trap on purpose. And A on a key must be claimed by the keyboard's own
  scope: inside a trap `activateFocused` stands down, so nothing clicks the focused key for it.
  Whatever the keyboard gets wrong, it will not be these two.
- `data-snav-editing` takes the attribute set from nine to ten and is frozen at v1 with the rest
  ([ADR-0001](0001-name-scope-and-attribute-prefix.md)).
- A layout is a public data shape, so its type is part of the surface a version number covers
  ([ADR-0012](0012-versioning-and-release.md)). Adding an optional field to `KeyboardKey` is a minor;
  renaming one breaks every third-party layout.
- The keyboard must not be reachable by the spatial engine while closed. Its container is `hidden`
  when shut, which is what makes it no candidate — the same mechanism the listbox recipe relies on,
  and the reason both can sit in the document from the start instead of being mounted on open.
- An application that already has an on-screen keyboard gets `openOn: "manual"` and a plain refusal:
  two keyboards on one field is worse than none, and the package cannot detect the other one.
- Nothing here has run on a television, and the module that implements it will not have either
  ([ADR-0014](0014-device-and-browser-matrix.md)). The riskiest untested assumption is not the
  typing — it is that a platform's own on-screen keyboard does not also appear, which would put two
  keyboards on the field by no fault of this code.

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
