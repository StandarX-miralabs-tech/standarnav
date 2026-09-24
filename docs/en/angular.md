# Angular

`@standarx/nav/angular` is the same instance-per-tree system with a provider around it, for Angular
20.0 and later. The engines are deliberately not imported by the adapter, so an application that
never mentions a gamepad pays no bytes for one — you build the plugins and pass them in.

```sh
bun add @standarx/nav @angular/core
```

`@angular/core` is an **optional** peer dependency at `>=20.0.0`, and the only Angular one;
nothing outside `src/angular/` imports it, and the adapter is measured with Angular external. The
adapter is plain `provide*` and `inject*` functions over Angular's public runtime — no component,
no directive, no decorator — so it ships no compiled Angular code and needs no Angular compiler of
its own, and your components, compiled by your own build, call it. What React and Vue write as a
`<NavProvider>` tag is a list of providers here: `provideNav`.

```ts
// main.ts
import { bootstrapApplication } from "@angular/platform-browser";
import { provideNav } from "@standarx/nav/angular";
import { gamepadPlugin } from "@standarx/nav/gamepad";
import { spatialPlugin } from "@standarx/nav/spatial";
import { App } from "./app";

const plugins = [gamepadPlugin(), spatialPlugin({ mode: "app" })];

bootstrapApplication(App, { providers: [provideNav({ plugins })] });
```

```ts
// dialog.ts
import { Component, ElementRef, inject, output } from "@angular/core";
import { injectIntent } from "@standarx/nav/angular";
import { Level } from "./level";

@Component({
  selector: "app-dialog",
  imports: [Level],
  template: `<div data-snav="container" data-snav-trap><app-level /></div>`,
})
export class Dialog {
  readonly closed = output();

  constructor() {
    injectIntent(
      (event) => {
        if (event.intent !== "back") return false;
        this.closed.emit();
        return true;
      },
      { trapped: true, within: inject(ElementRef) },
    );
  }
}
```

```ts
// level.ts
import { Component, ElementRef, inject, signal } from "@angular/core";
import { injectIntent } from "@standarx/nav/angular";

@Component({
  selector: "app-level",
  template: `<div role="radiogroup">…</div>`,
})
export class Level {
  readonly level = signal(0);

  constructor() {
    injectIntent(
      (event) => {
        if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
        const step = event.intent === "moveDown" ? 1 : -1;
        this.level.update((level) => Math.max(0, Math.min(2, level + step)));
        return true;
      },
      { within: inject(ElementRef) },
    );
  }
}
```

**A trap names its surface, and a composite inside it names its own element.** `Level` is created
in the same render as `Dialog`. Angular runs the after-render hooks of one render parent first, so
the adapter opens the scopes of one render in the DOM order of their host elements, children
before parents: the radio group's scope is opened first and sits *under* the dialog's trap, as it
would in React or Vue, whether `Level` is in `Dialog`'s template, as here, or projected into it. A
trap silences what is beneath it, and without `within` the dialog would silence its own radio group
([issue #14](https://github.com/StandarX-miralabs-tech/standarnav/issues/14)). With `within` on
both, a scope beneath the trap whose element lies inside the trap's surface is still asked — after
the trap, because containment does not reorder the stack, so the dialog claims only what it owns
(`back` here) and lets the arrows through. A trap or a scope with no `within` behaves exactly as
before; the reasoning is [ADR-0025](../adr/0025-trap-within-its-surface.md). `within` takes an
element, an `ElementRef` — `inject(ElementRef)` is the component's host element — or a signal or a
getter answering either. It is read at every dispatch, so an element that only exists after the
first render is seen and nothing re-opens the scope. `data-snav-trap` is still what keeps the
spatial engine inside the dialog. Pinned in `src/angular/angular.browser.test.ts` by "moves a radio
group mounted with its dialog, both passing their ElementRef", "moves the radio group when its
within is a signal filled after the first render", "moves the radio group when the dialog's within
is an element that existed before", "keeps a radio group that names no element silenced, as
before" and "does not open the scope again when its element fills or change detection runs again",
and the order by "opens a child in its parent's template before its parent" and "opens a child
projected into its parent before its parent"; `bun run test:browser` passed them on chromium,
firefox and webkit on 2026-09-24.

**Where `provideNav` goes, and when it builds.** `provideNav` returns a plain `Provider[]`, which
goes in three places:

- The application's providers, as above, or `ApplicationConfig.providers`. The provider is created
  with the application's injector, so a system exists even when no component injects anything — an
  application with a spatial plugin and no scope at all navigates.
- A route's `providers`. The router creates an environment injector for the route, and the provider
  is created with it. The system then lives as long as that injector: the router keeps a route's
  injector after navigating away, unless the route's `RouteReuseStrategy` says otherwise
  ([ADR-0029](../adr/0029-angular-adapter.md)).
- A component's `providers`, for a system that belongs to that component's subtree. Angular creates
  a component's providers on their first request and runs nothing at start-up, so the system is
  built once something below asks for it — any `injectIntent` does. When nothing does, because the
  subtree only needs a plugin, the providing component calls `injectInputSystem()` itself.

Do not wrap it in `makeEnvironmentProviders`: a component's `providers` reject that with NG0207.
Pinned in `src/angular/angular.browser.test.ts` by "builds a system at bootstrap when nothing
injects anything, for a plugin and no scope", "builds one in an environment injector created the
way a route's is", "builds one in a component's providers once the providing component asks for
it" and "builds nothing in a component's providers that nothing asks for"; `bun run test:browser`
passed them on chromium, firefox and webkit on 2026-09-24.

**Hold the plugins in a plain constant.** `options` is an object, or a signal or a getter
returning one, read again whenever what it reads changes. The provider compares the `plugins` list
element by element, so a getter that returns a fresh array around the same instances costs nothing
— but a plugin *constructed* inside the getter, `provideNav(() => ({ plugins: [gamepadPlugin()]
}))`, is a new object each time the getter runs: the system is destroyed and rebuilt, modality
refcount and all. A `keymap` literal needs no such care: it is compared one level deep. Pinned in
`src/angular/angular.browser.test.ts` by "keeps the system when the getter returns a fresh array
around the same plugins", "keeps the system when the getter returns a fresh keymap literal with the
same keys", "rebuilds when the plugins themselves are built in the getter" and "reads a Signal of
options, and rebuilds when its content changes"; `bun run test:browser` passed them on chromium,
firefox and webkit on 2026-09-24.

| Export | What it is |
|---|---|
| `provideNav(options?)` | `options` is `{ plugins, keymap, allowVerticalInText }`, or a signal or a getter returning it. Returns the `Provider[]` for an application, a route or a component. Builds one input system after the first render and destroys it with the injector that holds it. |
| `injectIntent(handler, options?)` | Opens an intent scope from the end of the render that created the calling component to its destruction. Call it in an injection context: a constructor or a field initialiser. `trapped` and `base` take a value, a signal or a getter; a change re-opens the scope where it was opened. `within` — an element, an `ElementRef`, a signal or a getter — is read at dispatch and never re-opens it. The handler's answer — `true`, `false`, nothing or `"native"` — reaches the bus unchanged. |
| `injectInputSystem()` | A `Signal` of the system, or of `null`. |
| `injectIntentScopeHost()` | A host stable for the life of the provider, for a state machine that opens scopes whenever it enters a state. A scope pushed through it before the system exists is opened once it does. Its `pushScope` forwards the options as given, so `within` there is an element or a getter. `null` without a provider. |
| `injectInputModality()` | A `Signal` of one of `keyboard` \| `pointer` \| `touch` \| `gamepad`, `pointer` until the first render. Works with no provider above it. |
| `provideNavDocument(doc)` | `doc` is a `Document`, or a signal or a getter for one. Only needed when the tree does not live in the page's own document — an iframe, a popup, a test fixture. Goes in the same `providers` as `provideNav`, or in an injector above it. Re-read when something reactive it reads changes. |

**Server rendering and hydration.** `injectInputSystem()` answers `null` until the first render in
a browser, and `null` is what a server renders: the system is built by an `afterRenderEffect`,
which Angular never runs on a server, because `createInputSystem` needs a document and installs
capture-phase listeners. `injectIntent` opens its scope from an `afterNextRender`, so nothing is
opened on a server either, and a scope pushed through `injectIntentScopeHost` while a component is
constructed is recorded and pushed when the system is built. Component effects do run on a server:
the one the adapter creates, which re-opens a scope when `trapped` or `base` changes, finds nothing
open there and touches no document. `injectIntent` warns in development only when there is
genuinely no provider above it, and only after a render in a browser. Pinned by "renders every
function's first answer with no document, and builds nothing" and "builds nothing from a provider
given to the application either" in `src/angular/angular.test.ts`, which render with
`renderApplication` from `@angular/platform-server` in Node, where there is no `document` at all,
a provider at component level and one at application level, every function, and a
`provideNavDocument` whose getter throws; `bun run test:unit` passed them on 2026-09-24, and the
client side of the same promise by "renders once with no system, then builds one after the first
render and hands it down" in `src/angular/angular.browser.test.ts`.

**Zone.js or zoneless.** The adapter needs neither: it schedules nothing of its own, and what it
sets are signals, which zoneless change detection sees. The suite runs zoneless, the default since
Angular 21; on Angular 20, zoneless has to be asked for with `provideZonelessChangeDetection()`, as
the test harness does (`src/angular/angular-harness.ts`). Under Zone.js, run once on 2026-09-24 on
a copy of this repository with `zone.js` 0.16.3 and `provideZoneChangeDetection()`, and not in CI:
50 of the 53 browser cases passed. The three others assert that the provider's first render sees no
system, in a harness that creates the application first and its component a microtask later;
Zone.js runs a change detection in between, with nothing rendered, and the system is already built
when the component first renders. Started with `bootstrapApplication` instead, the first render saw
no system with the provider at application and at component level.

**Scopes keep the order they were opened in, across a rebuild too.** A new plugin, `keymap`,
`allowVerticalInText` or document makes the provider destroy its system and build another. Every
scope opened through `injectIntent` or `injectIntentScopeHost().pushScope` is registered with the
provider, in the order it was opened, and the provider re-opens all of them on the new system in
that order, above the scopes its plugins push, before any component sees the new system
(`createNav`, `src/angular/angular.ts:163`) — the same registry the React, Vue and Svelte adapters
use. A new `trapped` or `base` keeps the scope in its place too. Each `provideNav` keeps its own
order. Pinned in `src/angular/angular.browser.test.ts` by "keeps sibling host scopes in the order
they were opened", "keeps a host trap above a hook scope opened before it", "keeps a nested
composite under the trap of the dialog around it", "keeps a hook scope opened over a host trap
above that trap" and "re-opens a scope in its place when a signal it was given for trapped
changes", and in the shared suite by the three "across a system rebuild" cases; `bun run
test:browser` passed them on chromium, firefox and webkit on 2026-09-24.

What this does not change is the order of the first render, which the adapter sets to React's: a
child's scope is opened before its parent's in the same render. That order is why the Dialog
recipe at the top of this page passes `within`.

**Native radios and ranges in `app` mode keep their arrows when a scope answers `"native"`.** In
`app` mode the spatial engine takes every arrow key, so a native radio group moves the focus
without checking anything. A handler may return `"native"` beside `true` and `false`: the walk
ends before the engine and the key keeps its browser default
([ADR-0026](../adr/0026-native-handler-answer.md)).

```ts
import { Component, ElementRef, inject } from "@angular/core";
import { injectIntent } from "@standarx/nav/angular";

@Component({
  selector: "app-sizes",
  template: `<div role="radiogroup">…</div>`,
})
export class Sizes {
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    injectIntent(
      (event) =>
        event.source === "keyboard" &&
        (event.intent === "moveUp" || event.intent === "moveDown") &&
        host.nativeElement.contains(document.activeElement)
          ? "native"
          : false,
      { within: host },
    );
  }
}
```

Answer for the keyboard only, since a pad has no native default for a direction, and only along
the control's own axis — up and down here, left and right for a range: a television remote's
arrows arrive as the same keys, and a native radio group wraps on chromium and firefox, so the
other axis has to stay the engine's for a remote user to leave. The reasoning is in
[Navigation](navigation.md#native-radios-and-ranges-in-app-mode). Pinned in
`src/angular/angular.browser.test.ts` by "lets a real ArrowDown check the next radio through
injectIntent", which also checks that ArrowRight still reaches the button beside the group, and
"hands a host scope's native answer back unchanged"; `bun run test:browser` passed them on
chromium, firefox and webkit on 2026-09-24. On a page served by Vite and driven with real keys on
the three engines the same day, a dialog holding this group checked the next radio on ArrowDown and
ArrowUp, left it for the button beside it on ArrowRight, and closed on Escape
([ADR-0029](../adr/0029-angular-adapter.md), Evidence).

**The floor is 20.0.0, and it is run.** `DOCUMENT` is exported from `@angular/core` from 20.0.0,
and `effect`, `afterRenderEffect` and the callback form of `afterNextRender` are public API there.
A CI job installs exactly 20.0.0 of `@angular/core` and of the Angular packages the tests load,
over the lockfile's 22.2, and runs the typecheck, the unit project and the browser suite against it
(`angular-floor`, `.github/workflows/ci.yml:202-226`); on 19.2 the adapter does not load, "does not
provide an export named 'DOCUMENT'", and why the floor sits where it does is
[ADR-0029](../adr/0029-angular-adapter.md). Angular 20 is in long-term support until 2026-11-28
(https://angular.dev/reference/releases, fetched 2026-09-24). On 20.0.0 to 20.1.6, a destroyed
provider's after-render effect stays linked to the signals its options read until they are
collected, which Angular fixed in 20.1.7; nothing it holds runs again.

The adapter is held to the shared suite `src/adapter-parity.ts`, the same 16 cases React, Vue and
Svelte pass — one system and not during the first render, LIFO scope order, a scope released when
only its own subtree unmounts, a trap that stops the walk, a base scope reached through that trap,
a composite nested in a trapping surface reached when both pass `within` and silenced when neither
does, a base re-registered on a rerender without leaving its place, and the order scopes were
opened in kept across a system rebuild. `runAdapterParitySuite` runs them at
`src/angular/angular.browser.test.ts:1143`, and `bun run test:browser` passed them on chromium,
firefox and webkit on 2026-09-24 ([React](react.md), [Vue](vue.md) and [Svelte](svelte.md) hold the
same contract). Angular is the last adapter in the order of
[ADR-0011](../adr/0011-package-layout-and-adapters.md).
