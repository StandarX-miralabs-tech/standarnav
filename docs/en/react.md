# React

`@standarx/nav/react` is the same instance-per-tree system with a provider around it. The engines
are deliberately not imported by the adapter, so an application that never mentions a gamepad pays
no bytes for one — you build the plugins and pass them in.

```tsx
import { useMemo, useRef, useState } from "react";
import { NavProvider, useIntent } from "@standarx/nav/react";
import { gamepadPlugin } from "@standarx/nav/gamepad";
import { spatialPlugin } from "@standarx/nav/spatial";

export function App() {
  const [open, setOpen] = useState(true);
  const plugins = useMemo(() => [gamepadPlugin(), spatialPlugin({ mode: "app" })], []);
  return (
    <NavProvider plugins={plugins}>
      {open ? <Dialog onClose={() => setOpen(false)} /> : null}
    </NavProvider>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const surface = useRef<HTMLDivElement>(null);
  useIntent(
    (event) => {
      if (event.intent !== "back") return false;
      onClose();
      return true;
    },
    { trapped: true, within: surface },
  );

  return (
    <div ref={surface} data-snav="container" data-snav-trap>
      <Level />
    </div>
  );
}

function Level() {
  const group = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(0);
  useIntent(
    (event) => {
      if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
      const step = event.intent === "moveDown" ? 1 : -1;
      setLevel((at) => Math.max(0, Math.min(2, at + step)));
      return true;
    },
    { within: group },
  );

  return <div ref={group} role="radiogroup">…</div>;
}
```

**A trap names its surface, and a composite inside it names its own element.** `Level` mounts in
the same commit as `Dialog`, and React runs a child's effect before its parent's, so the radio
group's scope is opened first and sits *under* the dialog's trap. A trap silences what is beneath
it, and without `within` the dialog silenced its own radio group
([issue #14](https://github.com/StandarX-miralabs-tech/standarnav/issues/14)). With `within` on
both, a scope beneath the trap whose element lies inside the trap's surface is still asked —
after the trap, because containment does not reorder the stack, so the dialog claims only what it
owns (`back` here) and lets the arrows through. A trap or a scope with no `within` behaves exactly
as before; the reasoning is [ADR-0025](../adr/0025-trap-within-its-surface.md). `within` takes a
ref, an element or a getter, read at every dispatch, so a ref filled after the first commit or a
new arrow on every render never re-opens the scope. `data-snav-trap` is still what keeps the
spatial engine inside the dialog. Pinned in `src/react/react.browser.test.tsx` by "moves a radio
group mounted with its dialog, its within given as ref" (and as getter, and as element), "keeps a
radio group that names no element silenced, as before" and "does not open the scope again for a
within that is a new arrow on every render"; `bun run test:browser` passed them on chromium,
firefox and webkit on 2026-09-23.

**The `useMemo` is the contract, not decoration.** The provider compares the `plugins` list element
by element with `Object.is`, so a fresh array literal around stable instances costs nothing — but a
plugin *constructed* in the JSX, `plugins={[gamepadPlugin()]}`, is a new object on every render:
the contents genuinely did change, and the system is destroyed and rebuilt, modality refcount and
all. Hoist the instances or memoise them. Two browser tests pin both halves. A `keymap` literal
needs no such care — it is compared one level deep over its string values, so
`keymap={{ keys: { … } }}` really is stable.

| Export | What it is |
|---|---|
| `NavProvider` | Builds one input system for the tree and destroys it on unmount. |
| `useIntent(handler, options?)` | Opens an intent scope for the component's lifetime. The handler is read through a ref, so an inline arrow does not pop and re-push the scope — which would silently reorder it under anything pushed since. A new `trapped` or `base` keeps the scope where it was opened. `within` — a ref, an element or a getter — is read at dispatch and never re-opens it. |
| `useInputSystem()` | The system, or `null`. |
| `useIntentScopeHost()` | A host stable for the life of the provider, for a state machine that installs its effects on entering a state and has no dependency array to re-run on. A scope pushed through it before the system exists is opened once it does. Its `pushScope` forwards the options as given, so `within` there is an element or a getter such as `() => ref.current`, not a ref. `null` without a provider. |
| `useInputModality()` | `keyboard` \| `pointer` \| `touch` \| `gamepad`. Works with no provider above it: the modality store is ref-counted per document, so a component that only wants to know whether to draw a ring pays for a tracker, not for an input system. |
| `NavDocumentProvider` | Only needed when the tree does not live in the page's own document — an iframe, a popup, a test fixture. |

`useInputSystem()` answers `null` until the provider's effect has run, and `null` is also what it
answers on the server and without a provider: `createInputSystem` needs a document and installs
capture-phase listeners, so it cannot happen during render, and children render once with `null`.
`useIntent` and `useIntentScopeHost` handle that themselves: a scope opened before the system
exists is recorded by the provider and pushed when the system is built. `useIntent` warns in
development only when there is genuinely no provider above it.

**Scopes keep the order they were opened in, across a rebuild too.** A new `plugins`, `keymap`,
`allowVerticalInText` or document makes the provider destroy its system and build another. Every
scope opened through `useIntent` or `useIntentScopeHost().pushScope` is registered with the
provider, in the order it was opened, and the provider re-opens all of them on the new system in
that order, above the scopes its plugins push, before any component sees the new system
(`NavProvider`'s effect, `src/react/react.tsx:243-245`). The components do not re-push anything
themselves: their effects would run in tree order, children before parents, and a trap opened last
could come back beneath the scope it was covering. A new `trapped` or `base` on `useIntent` keeps
the scope in its place too — it is re-opened there, with every scope opened after it re-opened
above it again. Each `NavProvider` keeps its own order, so two providers on one page never share
one. Pinned in `src/react/react.browser.test.tsx` by "keeps sibling host scopes in the order they
were opened", "keeps a host trap above a hook scope opened before it", "keeps a nested composite
under the trap of the dialog around it" and "leaves one registration per scope under StrictMode,
across a rebuild too", and in the shared suite by the three "across a system rebuild" cases and
"re-registers a scope when its base changes on a rerender"; `bun run test:browser` passed them on
chromium, firefox and webkit on 2026-09-23.

What this does not change is the order of the first commit, which is React's: a child's effect
runs before its parent's, so a scope a component opens is opened before the one its parent opens
in the same commit — the nested case above asserts that order for a composite and the item inside
it. That order is why the Dialog recipe at the top of this page passes `within`.

`react` and `react-dom` are **optional** peer dependencies at `>=18.3.0`; nothing outside
`src/react/` imports them, and the adapter is measured with React external. The floor of that range
is built, typechecked and run for real: a CI job reinstalls React 18.3 over the lockfile's 19 and
runs the browser suite against it, because every other job installs `--frozen-lockfile` and would
never have exercised 18.

The adapter is held to a shared suite rather than to tests of its own invention:
`src/adapter-parity.ts` is the contract any framework adapter has to satisfy — one system and not
during the first render, LIFO scope order, a scope released when only its own subtree unmounts, a
trap that stops the walk, a base scope reached through that trap, a composite nested in a trapping
surface reached when both pass `within` and silenced when neither does, a base re-registered on a
rerender without leaving its place, and the order scopes were opened in kept across a system
rebuild. The adapters that follow — Vue, Svelte and Angular, in the order of
[ADR-0011](../adr/0011-package-layout-and-adapters.md) — run the same suite before they ship. The
vanilla auto-mount helper that shipped before them does not, and
[ADR-0023](../adr/0023-vanilla-auto-mount.md) is the record of why: the suite asserts what a
provider does across a render, and that helper has neither ([Auto-mount](auto.md)).
