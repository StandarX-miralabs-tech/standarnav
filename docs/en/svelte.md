# Svelte

`@standarx/nav/svelte` is the same instance-per-tree system with a provider around it, for Svelte
5.0 and later. The engines are deliberately not imported by the adapter, so an application that
never mentions a gamepad pays no bytes for one — you build the plugins and pass them in.

```sh
bun add @standarx/nav svelte
```

`svelte` is an **optional** peer dependency at `>=5.0.0`; nothing outside `src/svelte/` imports
it, and the adapter is measured with Svelte external. The adapter is plain functions over Svelte's
public runtime — no component, no rune, no `.svelte` file — so it needs no Svelte compiler of its
own, and your components call it from their `<script>`. What React and Vue write as a
`<NavProvider>` tag is a function here: `provideNav`, called in the component whose subtree gets the
system.

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { provideNav } from "@standarx/nav/svelte";
  import { gamepadPlugin } from "@standarx/nav/gamepad";
  import { spatialPlugin } from "@standarx/nav/spatial";
  import Dialog from "./Dialog.svelte";

  const plugins = [gamepadPlugin(), spatialPlugin({ mode: "app" })];
  provideNav({ plugins });

  let open = $state(true);
</script>

{#if open}
  <Dialog onclose={() => (open = false)} />
{/if}
```

```svelte
<!-- Dialog.svelte -->
<script lang="ts">
  import { useIntent } from "@standarx/nav/svelte";
  import Level from "./Level.svelte";

  let { onclose }: { onclose: () => void } = $props();
  let surface = $state<HTMLElement | null>(null);
  useIntent(
    (event) => {
      if (event.intent !== "back") return false;
      onclose();
      return true;
    },
    { trapped: true, within: () => surface },
  );
</script>

<div bind:this={surface} data-snav="container" data-snav-trap>
  <Level />
</div>
```

```svelte
<!-- Level.svelte -->
<script lang="ts">
  import { useIntent } from "@standarx/nav/svelte";

  let group = $state<HTMLElement | null>(null);
  let level = $state(0);
  useIntent(
    (event) => {
      if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
      const step = event.intent === "moveDown" ? 1 : -1;
      level = Math.max(0, Math.min(2, level + step));
      return true;
    },
    { within: () => group },
  );
</script>

<div bind:this={group} role="radiogroup">…</div>
```

**A trap names its surface, and a composite inside it names its own element.** `Level` mounts
with `Dialog`, and Svelte runs a child's `onMount` before its parent's, so the radio group's scope
is opened first and sits *under* the dialog's trap. A trap silences what is beneath it, and without
`within` the dialog would silence its own radio group
([issue #14](https://github.com/StandarX-miralabs-tech/standarnav/issues/14)). With `within` on
both, a scope beneath the trap whose element lies inside the trap's surface is still asked — after
the trap, because containment does not reorder the stack, so the dialog claims only what it owns
(`back` here) and lets the arrows through. A trap or a scope with no `within` behaves exactly as
before; the reasoning is [ADR-0025](../adr/0025-trap-within-its-surface.md). `within` takes an
element or a getter; with `bind:this`, pass the getter `() => surface`, which is read at every
dispatch, so an element bound at mount is seen and nothing re-opens the scope. `data-snav-trap` is
still what keeps the spatial engine inside the dialog. Pinned in `src/svelte/svelte.browser.test.ts`
by "moves a radio group mounted with its dialog, its within a getter over bind:this", "moves the
radio group when the dialog's within is an element that existed before init", "keeps a radio group
that names no element silenced, as before" and "does not open the scope again when its bound
element fills or the component re-renders"; `bun run test:browser` passed them on chromium, firefox
and webkit on 2026-09-24.

**A provider for a subtree is a two-line component.** `provideNav` provides to the component that
calls it and everything below it. When the system belongs to a part of the page rather than to the
root, wrap that part in a component of your own:

```svelte
<!-- Nav.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { type InputPlugin, type KeymapOverrides, provideNav } from "@standarx/nav/svelte";

  let { plugins, keymap, children }: {
    plugins: readonly InputPlugin[];
    keymap?: KeymapOverrides;
    children: Snippet;
  } = $props();
  provideNav(() => ({ plugins, keymap }));
</script>

{@render children()}
```

The getter is what lets a changed prop reach the provider: Svelte passes reactive state into a
function as a getter, and `provideNav` reads it again whenever what it reads changes.

**Hold the plugins in a plain constant.** The provider compares the `plugins` list element by
element, so a getter that returns a fresh array around the same instances costs nothing — but a
plugin *constructed* inside the getter, `provideNav(() => ({ plugins: [gamepadPlugin()] }))`, is a
new object each time the getter runs: the system is destroyed and rebuilt, modality refcount and
all. Do not put them in `$state` either, which would hand the provider proxies of them. A `keymap`
literal needs no such care: it is compared one level deep. Pinned in
`src/svelte/svelte.browser.test.ts` by "keeps the system when the getter returns a fresh array
around the same plugins", "keeps the system when the getter returns a fresh keymap literal with the
same keys" and "rebuilds when the plugins themselves are built in the getter"; `bun run
test:browser` passed them on chromium, firefox and webkit on 2026-09-24.

| Export | What it is |
|---|---|
| `provideNav(options?)` | `options` is `{ plugins, keymap, allowVerticalInText }` or a getter returning it. Builds one input system for the calling component's subtree on mount and destroys it on destroy. Call it while the component initialises, in its `<script>`. |
| `useIntent(handler, options?)` | Opens an intent scope from the component's mount to its destruction. `trapped` and `base` take a value or a getter such as `() => open`; a change re-opens the scope where it was opened. `within` — an element or a getter — is read at dispatch and never re-opens it. The handler's answer — `true`, `false`, nothing or `"native"` — reaches the bus unchanged. Call it in `<script>`. |
| `useInputSystem()` | `{ current }`, the system or `null`. |
| `useIntentScopeHost()` | A host stable for the life of the provider, for a state machine that opens scopes whenever it enters a state. A scope pushed through it before the system exists is opened once it does. Its `pushScope` forwards the options as given, so `within` there is an element or a getter. `null` without a provider. |
| `useInputModality()` | `{ current }`, one of `keyboard` \| `pointer` \| `touch` \| `gamepad`, `pointer` until mounted. Works with no provider above it. |
| `provideNavDocument(doc)` | `doc` is a `Document` or a getter for one. Only needed when the tree does not live in the page's own document — an iframe, a popup, a test fixture. Call it **before** `provideNav`, in the same component or in one above it. The getter is re-read when something reactive it reads changes. |

**`provideNavDocument` comes first.** `provideNav` looks the document up when it is called, and a
`provideNavDocument` placed after it in the same component is one it never sees. In development,
that order prints a warning. Pinned by "warns when it comes after provideNav in the same
component, and only then" in `src/svelte/svelte.browser.test.ts`; `bun run test:browser` passed it
on chromium, firefox and webkit on 2026-09-24.

**Server rendering and hydration.** `useInputSystem().current` is `null` until the provider has
mounted, and `null` is what a server renders: the system is built in `onMount`, which Svelte never
runs on a server, because `createInputSystem` needs a document and installs capture-phase
listeners. `useIntent` opens its scope on mount too, so nothing is opened on a server, and a scope
pushed through `useIntentScopeHost` while a component initialises is recorded and pushed when the
system is built. Every `current` keeps the server's answer — `null`, and `"pointer"` for the
modality — until mount, so a hydrating first render reads what the server rendered. `useIntent` warns
in development only when there is genuinely no provider above it, and only on a mount. Pinned by
"renders every function's first answer with no document, and builds nothing" in
`src/svelte/svelte.test.ts`, which renders a provider, every function and a `provideNavDocument`
whose getter throws with `render` from `svelte/server` in Node, where there is no `document` at
all; `bun run test:unit` passed it on 2026-09-24, and the client side of the same promise by
"renders once with no system, then builds one on mount and hands it down" in
`src/svelte/svelte.browser.test.ts`. Because the package declares `svelte` as a peer,
`@sveltejs/vite-plugin-svelte` bundles it into the server build rather than loading it from
`node_modules`, so the adapter and the application share one Svelte runtime (the plugin's
`isSemiFrameworkPkgByJson`, read in its 7.3.1 tarball,
https://registry.npmjs.org/@sveltejs/vite-plugin-svelte/-/vite-plugin-svelte-7.3.1.tgz, on
2026-09-24).

**Scopes keep the order they were opened in, across a rebuild too.** A new plugin, `keymap`,
`allowVerticalInText` or document makes the provider destroy its system and build another. Every
scope opened through `useIntent` or `useIntentScopeHost().pushScope` is registered with the
provider, in the order it was opened, and the provider re-opens all of them on the new system in
that order, above the scopes its plugins push, before any component sees the new system
(`provideNav`, `src/svelte/svelte.ts:200`) — the same registry the React and Vue adapters use. A
new `trapped` or `base` keeps the scope in its place too. Each `provideNav` keeps its own order.
Pinned in `src/svelte/svelte.browser.test.ts` by "keeps sibling host scopes in the order they were
opened", "keeps a host trap above a hook scope opened before it", "keeps a nested composite under
the trap of the dialog around it", "keeps a hook scope opened over a host trap above that trap" and
"re-opens a scope in its place when a getter it was given for trapped changes", and in the shared
suite by the three "across a system rebuild" cases; `bun run test:browser` passed them on chromium,
firefox and webkit on 2026-09-24.

What this does not change is the order of the first mount, which is Svelte's: a child is mounted
before its parent, so a scope a component opens is opened before the one its parent opens in the
same mount. That order is why the Dialog recipe at the top of this page passes `within`.

**Native radios and ranges in `app` mode keep their arrows when a scope answers `"native"`.** In
`app` mode the spatial engine takes every arrow key, so a native radio group moves the focus
without checking anything. A handler may return `"native"` beside `true` and `false`: the walk
ends before the engine and the key keeps its browser default
([ADR-0026](../adr/0026-native-handler-answer.md)).

```svelte
<script lang="ts">
  import { useIntent } from "@standarx/nav/svelte";

  let group = $state<HTMLElement | null>(null);
  useIntent(
    (event) =>
      event.source === "keyboard" &&
      (event.intent === "moveUp" || event.intent === "moveDown") &&
      group?.contains(document.activeElement) === true
        ? "native"
        : false,
    { within: () => group },
  );
</script>

<div bind:this={group} role="radiogroup">…</div>
```

Answer for the keyboard only, since a pad has no native default for a direction, and only along
the control's own axis — up and down here, left and right for a range: a television remote's
arrows arrive as the same keys, and a native radio group wraps on chromium and firefox, so the
other axis has to stay the engine's for a remote user to leave. The reasoning is in
[Navigation](navigation.md#native-radios-and-ranges-in-app-mode). Pinned in
`src/svelte/svelte.browser.test.ts` by "lets a real ArrowDown check the next radio through
useIntent" and "hands a host scope's native answer back unchanged"; `bun run test:browser` passed
them on chromium, firefox and webkit on 2026-09-24. On a page served by Vite and driven with real
keys on the three engines the same day, a dialog holding this group checked the next radio on
ArrowDown and ArrowUp, left it for the button beside it on ArrowRight, and closed on Escape
([ADR-0028](../adr/0028-svelte-adapter.md), Evidence).

**The floor is 5.0.0, and it is run.** Everything the adapter calls — `setContext`, `getContext`,
`getAllContexts`, `onMount`, `untrack`, and `writable`, `toStore` and `fromStore` from
`svelte/store` — is in Svelte 5.0.0, and nothing newer is used. A CI job installs exactly
`svelte@5.0.0` over the lockfile's 5.57 and runs the typecheck, the unit project and the browser
suite against it (`svelte-floor`, `.github/workflows/ci.yml:169-193`); Svelte 4 has none of
`untrack`, `toStore` or `fromStore`, and why the floor sits where it does is
[ADR-0028](../adr/0028-svelte-adapter.md).

The adapter is held to the shared suite `src/adapter-parity.ts`, the same 16 cases React and Vue
pass — one system and not during the first render, LIFO scope order, a scope released when only
its own subtree unmounts, a trap that stops the walk, a base scope reached through that trap, a
composite nested in a trapping surface reached when both pass `within` and silenced when neither
does, a base re-registered on a rerender without leaving its place, and the order scopes were
opened in kept across a system rebuild. `runAdapterParitySuite` runs them at
`src/svelte/svelte.browser.test.ts:724`, and `bun run test:browser` passed them on chromium,
firefox and webkit on 2026-09-24 ([React](react.md) and [Vue](vue.md) hold the same contract).
Angular follows, in the order of [ADR-0011](../adr/0011-package-layout-and-adapters.md).
