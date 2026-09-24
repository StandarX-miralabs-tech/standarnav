# Auto-mount

`@standarx/nav/auto` is the start-up helper for a page with no framework and no mount hook to hang
a system on. It is not an adapter — the core already *is* the vanilla API, and `createInputSystem`
is one call. This subpath adds exactly two things to that call, and if you want neither of them,
do not import it.

```html
<html data-snav-mode="app">
  <body>
    <div data-snav="container">
      <button type="button">One</button>
      <button type="button">Two</button>
    </div>
    <script type="module">
      import { autoMount } from "@standarx/nav/auto";
      import { spatialPlugin } from "@standarx/nav/spatial";
      import { gamepadPlugin } from "@standarx/nav/gamepad";

      const nav = autoMount({
        plugins: ({ mode }) => [gamepadPlugin(), spatialPlugin({ mode })],
      });

      // Later, if the page tears itself down:
      // nav.destroy();
    </script>
  </body>
</html>
```

**1. It waits for the document.** If `document.readyState` is still `"loading"`, `autoMount`
defers everything to `DOMContentLoaded` and hands you a usable handle immediately — `nav.system`
is `null` until then. A `<script type="module">` is deferred by the platform and never takes that
branch; a classic `<script>` in `<head>` does, and without the wait the spatial engine would be
handed a document whose `<body>` does not exist yet. Calling `destroy()` before the document is
ready cancels the whole thing and builds nothing.

**2. The page picks the navigation mode.** `data-snav-mode` on the root element is read once,
before anything is constructed, and handed to your plugin factory. `app` selects `app`; **anything
else — a typo, an empty value, `APP`, or no attribute at all — is `composite`**, which is the safe
default for an ordinary web page ([ADR-0007](../adr/0007-navigation-modes.md)). It is the only
attribute in this package that no engine reads: a page that sets it and never calls `autoMount`
gets silence, not a warning.

**`plugins` takes a factory, and that is the point.** An array works too —
`plugins: [spatialPlugin({ mode: "app" })]` — but then the markup configures nothing: you have
already baked the mode into the instance, and the attribute has nothing left to apply itself to.
The factory runs once, after the document is ready, and receives `{ doc, root, mode }`.

Engines stay imports rather than attributes on purpose. A markup switch that could pull in the
gamepad engine would put that engine in the graph of every page importing this subpath, which is
the whole thing the per-subpath layout exists to prevent
([ADR-0011](../adr/0011-package-layout-and-adapters.md)).

| Export | What it is |
|---|---|
| `autoMount(options?)` | Builds one input system and returns `{ system, destroy }`. Never an import with a side effect: the package is `sideEffects: false`, so a bare `import "@standarx/nav/auto"` is a module a bundler may delete. |
| `AutoConfig` | What the factory receives: `doc`, `root`, and the parsed `mode`. |
| `AutoPlugins` | `readonly InputPlugin[]` or `(config: AutoConfig) => readonly InputPlugin[]`. |
| `AutoMountOptions` | `plugins`, `root`, `doc`, `keymap`, `allowVerticalInText` — the last two are forwarded to `createInputSystem` untouched. |
| `AutoMount` | The handle: `system`, `null` until the document is ready and again after `destroy`; and `destroy()`, which is idempotent. |

Everything else a page can say about navigation is already an attribute the spatial engine reads
off the markup with no help from here — containers, `data-snav-enter`, `-wrap`, `-block`, `-trap`,
`-scroll`, `-ignore` and the four direction redirections
([Attributes](attributes.md)). `autoMount` does not move the focus either: stealing it at load is
a regression on an ordinary page, and a television that wants it calls `focusFirst()` on the
spatial plugin it already holds.

The helper does **not** run the shared adapter parity suite, and that is deliberate rather than an
omission. That suite asserts what a framework *provider* must do — one system and not during the
first render, scope order across a re-render, a scope released when only its own subtree unmounts.
There is no render here and no provider to satisfy it with. `/auto` carries fourteen browser cases
of its own instead; Vue, Svelte and Angular are adapters and run the suite
([ADR-0023](../adr/0023-vanilla-auto-mount.md)).
