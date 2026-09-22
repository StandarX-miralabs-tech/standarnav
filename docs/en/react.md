# React

`@standarx/nav/react` is the same instance-per-tree system with a provider around it. The engines
are deliberately not imported by the adapter, so an application that never mentions a gamepad pays
no bytes for one — you build the plugins and pass them in.

```tsx
import { useMemo, useState } from "react";
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
  useIntent(
    (event) => {
      if (event.intent !== "back") return false;
      onClose();
      return true;
    },
    { trapped: true },
  );

  return <div data-snav="container" data-snav-trap>…</div>;
}
```

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
| `useIntent(handler, options?)` | Pushes an intent scope for the component's lifetime. The handler is read through a ref, so an inline arrow does not pop and re-push the scope — which would silently reorder it under anything pushed since. |
| `useInputSystem()` | The system, or `null`. |
| `useIntentScopeHost()` | A host stable for the life of the component, for a state machine that installs its effects on entering a state and has no dependency array to re-run on. |
| `useInputModality()` | `keyboard` \| `pointer` \| `touch` \| `gamepad`. Works with no provider above it: the modality store is ref-counted per document, so a component that only wants to know whether to draw a ring pays for a tracker, not for an input system. |
| `NavDocumentProvider` | Only needed when the tree does not live in the page's own document — an iframe, a popup, a test fixture. |

`useInputSystem()` answers `null` until the provider's effect has run, and `null` is also what it
answers on the server and without a provider: `createInputSystem` needs a document and installs
capture-phase listeners, so it cannot happen during render, and children render once with `null`.
`useIntent` handles that itself — it re-runs when the system arrives — and warns in development
only when there is genuinely no provider above it.

`react` and `react-dom` are **optional** peer dependencies at `>=18.3.0`; nothing outside
`src/react/` imports them, and the adapter is measured with React external. The floor of that range
is built, typechecked and run for real: a CI job reinstalls React 18.3 over the lockfile's 19 and
runs the browser suite against it, because every other job installs `--frozen-lockfile` and would
never have exercised 18.

The adapter is held to a shared suite rather than to tests of its own invention:
`src/adapter-parity.ts` is the contract any framework adapter has to satisfy — one system and not
during the first render, LIFO scope order, a scope released when only its own subtree unmounts, a
trap that stops the walk, a base scope reached through that trap, and a base re-registered on a
rerender. The adapters that follow — Vue, Svelte and Angular, in the order of
[ADR-0011](../adr/0011-package-layout-and-adapters.md) — run the same suite before they ship. The
vanilla auto-mount helper that shipped before them does not, and
[ADR-0023](../adr/0023-vanilla-auto-mount.md) is the record of why: the suite asserts what a
provider does across a render, and that helper has neither ([Auto-mount](auto.md)).
