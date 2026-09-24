# Vue

`@standarx/nav/vue` is the same instance-per-tree system with a provider around it, for Vue 3.3
and later. The engines are deliberately not imported by the adapter, so an application that never
mentions a gamepad pays no bytes for one — you build the plugins and pass them in.

```sh
bun add @standarx/nav vue
```

`vue` is an **optional** peer dependency at `>=3.3.0`; nothing outside `src/vue/` imports it, and
the adapter is measured with Vue external. The adapter is plain `defineComponent` and render
functions, so it needs no Vue compiler of its own; your single-file components use it like any
other component.

```vue
<!-- App.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { NavProvider } from "@standarx/nav/vue";
import { gamepadPlugin } from "@standarx/nav/gamepad";
import { spatialPlugin } from "@standarx/nav/spatial";
import Dialog from "./Dialog.vue";

const plugins = [gamepadPlugin(), spatialPlugin({ mode: "app" })];
const open = ref(true);
</script>

<template>
  <NavProvider :plugins="plugins">
    <Dialog v-if="open" @close="open = false" />
  </NavProvider>
</template>
```

```vue
<!-- Dialog.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { useIntent } from "@standarx/nav/vue";
import Level from "./Level.vue";

const emit = defineEmits<{ close: [] }>();
const surface = ref<HTMLElement | null>(null);
useIntent(
  (event) => {
    if (event.intent !== "back") return false;
    emit("close");
    return true;
  },
  { trapped: true, within: surface },
);
</script>

<template>
  <div ref="surface" data-snav="container" data-snav-trap>
    <Level />
  </div>
</template>
```

```vue
<!-- Level.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { useIntent } from "@standarx/nav/vue";

const group = ref<HTMLElement | null>(null);
const level = ref(0);
useIntent(
  (event) => {
    if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
    const step = event.intent === "moveDown" ? 1 : -1;
    level.value = Math.max(0, Math.min(2, level.value + step));
    return true;
  },
  { within: group },
);
</script>

<template>
  <div ref="group" role="radiogroup">…</div>
</template>
```

**A trap names its surface, and a composite inside it names its own element.** `Level` mounts
with `Dialog`, and Vue runs a child's `mounted` hook before its parent's, so the radio group's
scope is opened first and sits *under* the dialog's trap. A trap silences what is beneath it, and
without `within` the dialog would silence its own radio group
([issue #14](https://github.com/StandarX-miralabs-tech/standarnav/issues/14)). With `within` on
both, a scope beneath the trap whose element lies inside the trap's surface is still asked —
after the trap, because containment does not reorder the stack, so the dialog claims only what it
owns (`back` here) and lets the arrows through. A trap or a scope with no `within` behaves exactly
as before; the reasoning is [ADR-0025](../adr/0025-trap-within-its-surface.md). `within` takes a
template ref on an element, an element or a getter, read at every dispatch, so a ref filled at
mount is seen and nothing re-opens the scope. A ref on a *component* holds an instance, not an
element: pass `() => card.value?.$el` instead. `data-snav-trap` is still what keeps the spatial
engine inside the dialog. Pinned in `src/vue/vue.browser.test.ts` by "moves a radio group mounted
with its dialog, its within given as a template ref" (and as a getter), "moves the radio group when
the dialog's within is an element that existed before setup", "keeps a radio group that names no
element silenced, as before" and "does not open the scope again when its within ref fills or the
component re-renders"; `bun run test:browser` passed them on chromium, firefox and webkit on
2026-09-23.

**Hold the plugins in a plain constant.** The provider compares the `plugins` list element by
element, so a fresh array around the same instances costs nothing — but a plugin *constructed* in a
template or render function, `:plugins="[gamepadPlugin()]"`, is a new object on every render: the
system is destroyed and rebuilt, modality refcount and all. Do not put them in `ref()` or
`reactive()` either, which would hand the provider proxies of them. A `keymap` literal needs no
such care: it is compared one level deep. Pinned in `src/vue/vue.browser.test.ts` by "keeps the
system when the plugins arrive in a fresh array around the same instances", "keeps the system when
the keymap is a fresh literal with the same keys" and "rebuilds when the plugins themselves are
built in the render function"; `bun run test:browser` passed them on chromium, firefox and webkit
on 2026-09-23.

| Export | What it is |
|---|---|
| `NavProvider` | Props `plugins`, `keymap`, `allowVerticalInText`. Builds one input system for the tree on mount and destroys it on unmount. Renders its default slot and nothing else. |
| `useIntent(handler, options?)` | Opens an intent scope from the component's mount to its unmount. `trapped` and `base` take a value, a ref or a getter such as `() => props.open`; a change re-opens the scope where it was opened. `within` — a template ref, an element or a getter — is read at dispatch and never re-opens it. The handler's answer — `true`, `false`, nothing or `"native"` — reaches the bus unchanged. Call it in `setup`. |
| `useInputSystem()` | A `ShallowRef` holding the system, or `null`. |
| `useIntentScopeHost()` | A host stable for the life of the provider, for a state machine that opens scopes whenever it enters a state. A scope pushed through it before the system exists is opened once it does. Its `pushScope` forwards the options as given, so `within` there is an element or a getter, not a ref. `null` without a provider. |
| `useInputModality()` | A `ShallowRef` of `keyboard` \| `pointer` \| `touch` \| `gamepad`, `pointer` until mounted. Works with no provider above it. |
| `NavDocumentProvider` | Prop `doc`, a `Document` or a getter for one. Only needed when the tree does not live in the page's own document — an iframe, a popup, a test fixture. The getter is re-read when something reactive it reads changes. |

**Server rendering.** `useInputSystem()` holds `null` until the provider has mounted, and `null`
is what a server renders: the system is built in the provider's `onMounted`, never in `setup`,
because `createInputSystem` needs a document and installs capture-phase listeners. `useIntent`
opens its scope on mount too, so nothing is opened on a server, and a scope pushed through
`useIntentScopeHost` during `setup` is recorded and pushed when the system is built. `useIntent`
warns in development only when there is genuinely no provider above it, and only on a mount.
Pinned by "renders every composable's first answer with no document, and builds nothing" in
`src/vue/vue.test.ts`, which renders the provider, every composable and a `NavDocumentProvider`
whose getter throws with `renderToString` in Node, where there is no `document` at all; `bun run
test:unit` passed it on 2026-09-23.

**Scopes keep the order they were opened in, across a rebuild too.** A new `plugins`, `keymap`,
`allowVerticalInText` or document makes the provider destroy its system and build another. Every
scope opened through `useIntent` or `useIntentScopeHost().pushScope` is registered with the
provider, in the order it was opened, and the provider re-opens all of them on the new system in
that order, above the scopes its plugins push, before any component sees the new system
(`NavProvider`, `src/vue/vue.ts:174-176`) — the same registry the React adapter uses. A new
`trapped` or `base` keeps the scope in its place too. Each `NavProvider` keeps its own order.
Pinned in `src/vue/vue.browser.test.ts` by "keeps sibling host scopes in the order they were
opened", "keeps a host trap above a hook scope opened before it", "keeps a nested composite under
the trap of the dialog around it", "keeps a hook scope opened over a host trap above that trap" and
"re-opens a scope in its place when a ref it was given for trapped changes", and in the shared
suite by the three "across a system rebuild" cases; `bun run test:browser` passed them on chromium,
firefox and webkit on 2026-09-23.

What this does not change is the order of the first mount, which is Vue's: a child is mounted
before its parent, so a scope a component opens is opened before the one its parent opens in the
same mount. That order is why the Dialog recipe at the top of this page passes `within`.

**Native radios and ranges in `app` mode keep their arrows when a scope answers `"native"`.** In
`app` mode the spatial engine takes every arrow key, so a native radio group moves the focus
without checking anything. A handler may return `"native"` beside `true` and `false`: the walk
ends before the engine and the key keeps its browser default
([ADR-0026](../adr/0026-native-handler-answer.md)).

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useIntent } from "@standarx/nav/vue";

const group = ref<HTMLElement | null>(null);
useIntent(
  (event) =>
    event.source === "keyboard" &&
    (event.intent === "moveUp" || event.intent === "moveDown") &&
    group.value?.contains(document.activeElement) === true
      ? "native"
      : false,
  { within: group },
);
</script>

<template>
  <div ref="group" role="radiogroup">…</div>
</template>
```

Answer for the keyboard only, since a pad has no native default for a direction, and only along
the control's own axis — up and down here, left and right for a range: a television remote's
arrows arrive as the same keys, and a native radio group wraps on chromium and firefox, so the
other axis has to stay the engine's for a remote user to leave. The reasoning is in
[Navigation](navigation.md#native-radios-and-ranges-in-app-mode). Pinned in
`src/vue/vue.browser.test.ts` by "lets a real ArrowDown check the next radio through useIntent" and
"hands a host scope's native answer back unchanged"; `bun run test:browser` passed them on
chromium, firefox and webkit on 2026-09-23. On a page served by Vite and driven with real keys on
the three engines the same day, a dialog holding this group checked the next radio on ArrowDown and
ArrowUp, left it for the button beside it on ArrowRight, and closed on Escape
([ADR-0027](../adr/0027-vue-adapter.md), Evidence).

**Vue's build flags.** Vue's bundler build expects `__VUE_OPTIONS_API__`, `__VUE_PROD_DEVTOOLS__`
and `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` to be defined, and warns in the console when they are
not. `@vitejs/plugin-vue` defines them in its `config` hook
(https://raw.githubusercontent.com/vitejs/vite-plugin-vue/main/packages/plugin-vue/src/index.ts,
fetched 2026-09-23); a Vite config without it defines them itself, to Vue's defaults `true`,
`false` and `false` (https://github.com/vuejs/core/tree/main/packages/vue#bundler-build-feature-flags,
fetched 2026-09-23), as this repository's test config does (`vitest.config.ts`, `:35-39`).

**The floor is 3.3.0, and it is run.** The adapter uses `toValue`, `MaybeRefOrGetter` and the
setup-function form of `defineComponent`, all three first shipped in Vue 3.3. A CI job installs
exactly `vue@3.3.0` over the lockfile's 3.5 and runs the typecheck and the browser suite against it
(`vue-floor`, `.github/workflows/ci.yml:136-161`); why that version and not an older one is
[ADR-0027](../adr/0027-vue-adapter.md).

The adapter is held to the shared suite `src/adapter-parity.ts`, the same 16 cases React passes —
one system and not during the first render, LIFO scope order, a scope released when only its own
subtree unmounts, a trap that stops the walk, a base scope reached through that trap, a composite
nested in a trapping surface reached when both pass `within` and silenced when neither does, a base
re-registered on a rerender without leaving its place, and the order scopes were opened in kept
across a system rebuild. `runAdapterParitySuite` runs them at `src/vue/vue.browser.test.ts:921`,
and `bun run test:browser` passed them on chromium, firefox and webkit on 2026-09-23
([React](react.md) holds the same contract). [Svelte](svelte.md) and [Angular](angular.md)
followed on 2026-09-24, in the order of [ADR-0011](../adr/0011-package-layout-and-adapters.md).
