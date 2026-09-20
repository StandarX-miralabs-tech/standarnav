# standarnav

Spatial navigation for the web: d-pad, gamepad sticks, TV remotes and arrow keys drive real DOM focus, declared in data attributes.

**Status:** unreleased. The engine has landed in this repository under `src/`; the public API is not frozen, the `data-snav-*` attribute names are not final ([ADR-0001](docs/adr/0001-name-scope-and-attribute-prefix.md)), and nothing is published on npm. See [ROADMAP.md](ROADMAP.md).

## What it does

- Moves the real DOM focus: the engine calls `focusElement(to, { preventScroll: true })` and reads `document.activeElement` (`src/spatial/spatial.ts:329` and `:271-274`). Every path below is a path in **this** repository at HEAD.
- Plain HTML becomes navigable through attributes; the application writes no navigation code for it (`src/spatial/containers.ts:1-6`, header comment).
- Keyboard arrows, d-pad buttons, the left analog stick and TV remote keys produce the same intent events; the consumer of an intent cannot tell which device sent it.
- The right stick scrolls: the focused element's scroll container first, the document's `scrollingElement` when nothing else scrolls (`src/spatial/spatial.ts:470-476`, and `pageScroller` at `:232-235`). Four browser tests cover it (`src/spatial/spatial.browser.test.ts:317-384`).
- Containers nest, and each container remembers the element that was focused in it (`WeakMap<HTMLElement, ElementHandle>`, `src/spatial/spatial.ts:248`, written in `remember` at `:286`). `ElementHandle` is a `WeakRef` where the runtime has one and a self-releasing strong reference where it does not (`:105-141`).
- A container can wrap in one axis, block a direction, trap every exit, or redirect a direction to a CSS selector.
- When no candidate is found, the engine scrolls one step and rescans once on the next frame, which is how a virtualised list keeps producing rows (`src/spatial/spatial.ts:378-403`, called at `:436`). Two browser tests cover it against a list whose later row does not exist until the container has scrolled (`src/spatial/spatial.browser.test.ts:713-771`).
- Two modes: `composite` (arrow keys stay inside composites, a gamepad crosses the page) and `app` (arrow keys navigate the whole page). The plugin drops keyboard-sourced moves outright in `composite` mode (`src/spatial/spatial.ts:489`).
- `onWillMove` can veto a move before focus changes (`src/spatial/spatial.ts:312-326`); `onBoundsHit` fires when a direction has nowhere left to go (`:444`).
- A focus ring is an optional plugin: a WAAPI overlay that follows `focusin`, off unless you mount it (`src/focus-ring/focus-ring.ts`).
- `explainMove` returns the scored candidate list of a move, for debugging (`src/debug.ts:48`). Six browser tests cover it, including three of the five places it is meant to differ from the engine (the five are enumerated at `src/debug.ts:33-40`; the three tested are the directional redirect, the walk out to the parent container and wrapping, at `src/debug.browser.test.ts:113-180`).

## Install

Not published yet. Once it is published, the intended form is:

```sh
bun add @standarx/nav
```

The name is free as of 2026-09-18: a GET on `https://registry.npmjs.org/@standarx%2Fnav` answered 404 that day.

While the major stays 0, a minor may break: the snippet above pins an exact minor once a 0.x exists ([ADR-0012](docs/adr/0012-versioning-and-release.md)).

Zero runtime dependencies, and the packaging check fails if `package.json` ever declares one (`bun run check:package`). Sizes are min+gzip, measured here with `bun run build && bun run check:size` on 2026-09-20: core 3.13 kB, gamepad engine 2.48 kB, spatial engine 3.04 kB, focus ring 1.51 kB, debug 0.49 kB, react adapter 1.30 kB. Each subpath is bundled with the sibling entries it already imports left external, so its number is the marginal cost of adding that subpath rather than a second copy of what it sits beside — which is not always the core: the debug entry is measured next to the **spatial engine**, with `./spatial/spatial.js` and `./spatial/geometry.js` external, so a consumer who imports `./debug` without `./spatial` pays more than 0.49 kB (`scripts/size-budget.ts:105-114`). The core line has nothing external at all (`scripts/size-budget.ts:78-83`). The four runtime entries bundled together once come to 8.77 kB. The caps and the reasoning are [ADR-0017](docs/adr/0017-size-budgets.md).

## Usage

The whole setup, once `bun add @standarx/nav` has run:

```ts
import { createInputSystem } from "@standarx/nav";
import { gamepadPlugin } from "@standarx/nav/gamepad";
import { spatialPlugin } from "@standarx/nav/spatial";

const input = createInputSystem({ plugins: [gamepadPlugin(), spatialPlugin({ mode: "app" })] });
```

`mode: "app"` is what makes that snippet do something on a keyboard. The default, `composite`, returns `false` for any move whose source is the keyboard, so arrow keys stay inside whatever composite holds the focus and only Tab crosses between them — APG-strict, and the right default for a page inside an ordinary web application; a gamepad has no Tab and crosses the page in either mode (`src/spatial/spatial.ts:489`). The mode flips one other thing and nothing else: `pointerFollowsFocus` defaults to on in `app` and off in `composite`, so under `app` a hover moves the focus rather than leaving a mouse and a pad arguing over two cursors (`src/spatial/spatial.ts:238-239`, and the listener at `:508-524`). Both defaults are overridable per option.

`createInputSystem` owns the keyboard source and the scope stack; it is an instance, never a global singleton (`src/input-system.ts:89`). `input.destroy()` tears it down (`src/input-system.ts:67` and `:237-246`).

The rest is markup.

| Attribute | Placed on | Value | Effect |
|---|---|---|---|
| `data-snav="container"` | any element | fixed | Declares a navigation container; moves are scored inside it first. |
| `data-snav-enter` | a container | `last` \| `first` \| `nearest` | Which element takes focus when a move enters. Default `last`, which falls back to `nearest` when the remembered element is gone. |
| `data-snav-wrap` | a container | `x` \| `y` \| `both`, or bare | Wraps to the opposite edge instead of leaving the container. |
| `data-snav-block` | a container | directions separated by spaces, or bare | Blocks those exits; bare blocks every one. |
| `data-snav-trap` | a container | bare | A move never leaves this container. |
| `data-snav-scroll` | a container | `center` | Scrolls a newly focused element to the centre instead of `nearest`. |
| `data-snav-ignore` | any element | bare | Excludes the element from the candidate list. |
| `data-snav-up` / `-down` / `-left` / `-right` | a focusable | a CSS selector | Sends that direction to the first match in the document, before any geometry runs. |

The engine writes four attributes, which you can style against:

| Attribute | Written on | Values |
|---|---|---|
| `data-snav-focused` | the focused element | bare |
| `data-snav-active` | every container on the path to the focused element | bare |
| `data-snav-input` | `<html>` | `keyboard` \| `pointer` \| `touch` \| `gamepad` |
| `data-snav-focus-ring` | the focus ring overlay element, when the ring plugin is mounted | bare |

The `data-snav-*` names in both tables above are this repository's own, set by [ADR-0001](docs/adr/0001-name-scope-and-attribute-prefix.md), and they are part of what is not frozen yet: the nine attribute constants are at `src/spatial/containers.ts:10-18`, `MODALITY_ATTRIBUTE` at `src/modality.ts:19` and `RING_ATTRIBUTE` at `src/focus-ring/focus-ring.ts:26`.

## React

`@standarx/nav/react` is the same instance-per-tree system with a provider around it. The engines are deliberately not imported by the adapter, so an application that never mentions a gamepad pays no bytes for one — you build the plugins and pass them in (`src/react/react.tsx:1-10`).

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

The `useMemo` is the contract, not decoration. The provider compares the `plugins` list element by element with `Object.is`, so a fresh array literal around stable instances costs nothing (`src/react/react.tsx:125-129`) — but a plugin *constructed* in the JSX, `plugins={[gamepadPlugin()]}`, is a new object on every render: the contents genuinely did change, and the system is destroyed and rebuilt, modality refcount and all. Hoist the instances or memoise them; the prop says so (`:149-154`), and two browser tests pin both halves (`src/react/react.browser.test.tsx:23-85`). A `keymap` literal needs no such care — it is compared one level deep over its string values, so `keymap={{ keys: { … } }}` really is stable (`:135-146`).

| Export | What it is |
|---|---|
| `NavProvider` | Builds one input system for the tree and destroys it on unmount. |
| `useIntent(handler, options?)` | Pushes an intent scope for the component's lifetime. The handler is read through a ref, so an inline arrow does not pop and re-push the scope — which would silently reorder it under anything pushed since. |
| `useInputSystem()` | The system, or `null`. |
| `useIntentScopeHost()` | A host stable for the life of the component, for a state machine that installs its effects on entering a state and has no dependency array to re-run on. |
| `useInputModality()` | `keyboard` \| `pointer` \| `touch` \| `gamepad`. Works with no provider above it: the modality store is ref-counted per document, so a component that only wants to know whether to draw a ring pays for a tracker, not for an input system. |
| `NavDocumentProvider` | Only needed when the tree does not live in the page's own document — an iframe, a popup, a test fixture. |

`useInputSystem()` answers `null` until the provider's effect has run, and `null` is also what it answers on the server and without a provider: `createInputSystem` needs a document and installs capture-phase listeners, so it cannot happen during render, and children render once with `null` (`src/react/react.tsx:166-183`, and `useInputSystem` itself at `:190-192`). `useIntent` handles that itself — it re-runs when the system arrives — and warns in development only when there is genuinely no provider above it (`:293-303`).

`react` and `react-dom` are **optional** peer dependencies at `>=18.3.0` (`package.json`); nothing outside `src/react/` imports them, and the adapter is measured with React external, at 1.30 kB min+gzip against a 1.50 kB cap (`bun run check:size`, 2026-09-20). The floor of that range is built, typechecked and run for real: a CI job reinstalls React 18.3 over the lockfile's 19 and runs the browser suite against it, because every other job installs `--frozen-lockfile` and would never have exercised 18 (`.github/workflows/ci.yml:70-101`).

The adapter is held to a shared suite rather than to tests of its own invention: `src/adapter-parity.ts` is the contract any framework adapter has to satisfy — one system and not during the first render, LIFO scope order, a scope released when only its own subtree unmounts, a trap that stops the walk, a base scope reached through that trap, and a base re-registered on a rerender. React runs it at `src/react/react.browser.test.tsx:260-340`.

## How a move is decided

For one direction, starting from `document.activeElement` (`src/spatial/spatial.ts:405-446`):

1. **Redirect.** If the focused element carries `data-snav-<direction>`, the selector is resolved on the whole document and the move ends there (`:414-418`).
2. **Geometry.** Candidates are collected in the nearest declared container (`collectNavNodes`, `:170-193`). A nested container counts as one candidate, scored as a single rectangle, not as all of its children. The best-aligned candidate wins; ties go to DOM order, because candidates are collected in document order and that is the tiebreak the spec asks for (`src/spatial/geometry.ts:134-138`).
3. **Wrap.** If the container wraps in this axis, the move lands on the opposite edge (`:431-434`).
4. **Scroll and rescan.** If something can still scroll in this direction, the engine scrolls one step — four fifths of the scroller's own viewport — and retries once on the next frame (`:436`, and `SCROLL_STEP_RATIO` at `:56`). Only once, or a list with no reachable end would scroll to the bottom on a single press.
5. **Step out.** The walk moves to the parent container and repeats from step 2 — unless the container traps, blocks this direction, or is the root (`:438-441`). It is bounded at sixteen levels (`MAX_CONTAINER_DEPTH`, `:60`).

When the walk ends with nothing, `onBoundsHit(direction)` fires and the move returns `false` (`:444-445`).

`./spatial` publishes the two functions that walk that list — `containerOf` and `collectNavNodes` — so a diagnostic can score exactly what the engine scores rather than something that looks like it. The nine navigation attribute names stay private and are not part of the public API; the attribute tables above are the contract.

## Make your element navigable

- The engine sees what the platform sees: it collects elements matching the focusable selector (`input`, `select`, `textarea`, `button`, `a[href]`, `area[href]`, `iframe`, `object`, `embed`, `audio[controls]`, `video[controls]`, `summary`, `[contenteditable]`, `[tabindex]` — `src/tabbable.ts:17-32`).
- A `div` with an `onclick` is not focusable. Give it `tabindex="0"`, or use a real `button`.
- `aria-hidden` is deliberately not filtered: it hides an element from a screen reader, not from the d-pad. `isFocusable` rejects a non-matching selector, a `disabled` attribute, a hidden element and an inert one, and nothing else (`src/tabbable.ts:56-62`). Use `data-snav-ignore`, `inert`, or `display: none`.
- `aria-disabled` stays a candidate, on purpose, because the APG wants disabled items reachable (`src/tabbable.ts:60-61`); `inert` ancestors (`src/tabbable.ts:52-53`) and elements hidden per `checkVisibility` (`src/tabbable.ts:41-50`) are dropped.
- An element with **either** dimension at zero is dropped: the candidate filter tests `rect.width === 0 || rect.height === 0`, so a 0 by 40 element is not a candidate (`src/spatial/spatial.ts:188`). This is filter C1 of [ADR-0009](docs/adr/0009-hidden-candidates.md): it inverts an `&&` inherited from the predecessor implementation ([ADR-0002](docs/adr/0002-license-and-copyright.md)), which asked for both dimensions at once and let that 0 by 40 element through, and the inversion was decided and written here — such a rect paints nothing, and its projection onto the cross axis is empty, so the alignment pass can never call it aligned (`src/spatial/spatial.ts:183-187`). The rule is zero, not small — a hairline divider or a deliberately slim control stays reachable. Three browser tests hold that line (`src/spatial/spatial.browser.test.ts:583-631`). A candidate at `opacity: 0` is **not** filtered: that reads a computed style per candidate in the hot loop and misses opacity inherited from an ancestor anyway, so filter C2 is refused for v0 and deferred to v1. When a move surprises you, read the scored list with `explainMove`.
- Shadow roots are not traversed when candidates are collected: `getFocusables` is light DOM only in v0, deliberately, and a fixture for the other behaviour is parked as a skipped test (`src/tabbable.ts:10-12` and `src/spatial/spatial.browser.test.ts:856`). The reasoning and where it goes in v1 are in [ADR-0008](docs/adr/0008-shadow-dom.md).

## Focus ring

`@standarx/nav/focus-ring` is one overlay element that follows `focusin`, so it rings a keyboard Tab, a gamepad move and a programmatic `focus()` alike. It is off unless you mount it, and **no stylesheet ships**: the plugin writes its own paint inline, which is why there is nothing to import and nothing to forget to import (`src/focus-ring/focus-ring.ts:33-52`). It measures and animates its own overlay and never touches an application's elements.

Six CSS custom properties are the whole contract. Set them anywhere the overlay inherits from:

| Property | Fallback | What it sets |
|---|---|---|
| `--snav-focus-ring-z-index` | `1700` | The stacking rung. `position: fixed` opens no stacking context, so without a z-index the ring paints in DOM order and goes behind the first dialog it meets; the property itself was added here, when the ring was reviewed before merge ([ADR-0001](docs/adr/0001-name-scope-and-attribute-prefix.md)). `1700` is the fallback `RING_PAINT` carries inline (`src/focus-ring/focus-ring.ts:52`): a rung above a modal, a popover, a toast and a tooltip, an ordering inherited from the predecessor implementation ([ADR-0002](docs/adr/0002-license-and-copyright.md)) and not re-derived here, kept for the reason [ADR-0020](docs/adr/0020-focus-ring-defaults.md) gives. |
| `--snav-focus-ring-width` | `3px` | The ring's thickness, drawn as a `box-shadow` spread. |
| `--snav-focus-ring-color` | `#1a73e8` | 4.51:1 on white and 4.36:1 on `#0b0b0f`, both above the 3:1 WCAG SC 1.4.11 asks of a non-text indicator. |
| `--snav-focus-ring-offset` | `2` | Pixels between the target's box and the ring. Overridden by the `offset` option. |
| `--snav-focus-ring-duration` | `260`, or `150` under reduced motion | How long the ring takes to slide. Overridden by the `duration` option. |
| `--snav-focus-ring-easing` | `cubic-bezier(0.22, 1, 0.36, 1)` | The slide's easing. |

Read at `src/focus-ring/focus-ring.ts:52` (paint), `:104-106` (offset) and `:128-139` (duration and easing). Appearing and disappearing fade over 150 ms through WAAPI, and the fade is skipped outright under `prefers-reduced-motion` (`:147-154`). Two things the inline style cannot do are written down at `src/focus-ring/focus-ring.ts:44-49`: a custom property of the wrong type makes the whole declaration invalid with no earlier declaration to fall back to, and `forced-colors: active` suppresses `box-shadow`, so the ring disappears in a forced-colours theme — a v1 item on [ROADMAP.md](ROADMAP.md), not a v0 fix.

## Browser support

Baseline decision and evidence: [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md). The runtime versions below come from Samsung "Web Engine Specifications" and LG "Web API and Web Engine", fetched 2026-09-18; the full table with URLs is in [docs/research/tv-runtime-compatibility.md](docs/research/tv-runtime-compatibility.md).

| Tier | Runtimes | What it means |
|---|---|---|
| Supported | Chromium ≥ 85, Safari ≥ 15, Firefox ≥ 79 | The declared floor of ADR-0013. The build target is es2020. |
| Best effort | TV 2020-2021: Tizen 5.5 / 6.0 (Chromium 69 / 76), webOS 5.x / 6.x (Chromium 68 / 79) | The es2020 output does not parse below Chromium 80. A separate legacy build is a roadmap question, not a v0 promise. |

The es2020 syntax floor is Chrome 80, Safari 13.1, Firefox 74, Samsung Internet 13.0: it is set by optional chaining ([caniuse](https://caniuse.com/mdn-javascript_operators_optional_chaining)) and nullish coalescing ([caniuse](https://caniuse.com/mdn-javascript_operators_nullish_coalescing)), fetched 2026-09-18. A runtime below that line does not parse the output at all, which is why the second tier is best effort and not support.

The CI browser matrix runs chromium, firefox and webkit at the versions Playwright ships, one job per engine (`.github/workflows/ci.yml:103-129`). It runs the real suite: 194 passed and 1 skipped across 11 files on each engine (`bun run test:browser`, 2026-09-20; the skip is the shadow-DOM fixture above). It does not run the floor versions of the table — the three engines are current — so the tiers are a declared floor, not something CI proves.

Three modern APIs sit above that floor: `WeakRef` (Chrome 84, Safari 14.1, Firefox 79), `checkVisibility` (Chrome 105, Safari 17.4, Firefox 106), `inert` (Chrome 102, Safari 15.5, Firefox 112) — MDN browser-compat data, fetched 2026-09-18. The decision of [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md) — feature-detect with a fallback, and drop `Array.prototype.at` outright — is written here now, not pending: `checkVisibility` falls back to `offsetParent` plus `getClientRects()` (`src/tabbable.ts:41-50`), `WeakRef` falls back to a self-releasing strong reference with the same observable behaviour (`src/spatial/spatial.ts:105-141`), `inert` is read as an attribute selector that needs no support to match (`src/tabbable.ts:52-53`), and `Array.prototype.at` appears nowhere in the runtime, with the index arithmetic that replaced it commented to say why (`src/tabbable.ts:89`). `.at` is undefined below Chrome 92, Safari 15.4, Firefox 90 ([caniuse](https://caniuse.com/mdn-javascript_builtins_array_at), fetched 2026-09-18).

**No television, set-top box or handheld has been tested.** The default keymap carries webOS and Tizen remote key codes only: webOS Back 461, Tizen Return 10009, Tizen Exit 10182, channel up and down 427 and 428 (`src/keymap.ts:80-84`). There is nothing for Vidaa, Vizio, Roku, Fire TV or Android TV.

## Comparison

Twenty fact sheets were built source-first on 2026-09-18, covering 18 distinct projects (two of them were sheeted twice under two names); the versions named below were read on npm the same day. Six projects, on the four axes that matter here:

| Library | Real DOM focus | Attributes on plain HTML | Gamepad API | Framework-agnostic core |
|---|---|---|---|---|
| standarnav (this repository, unreleased) | yes | yes | yes | yes |
| Norigin `norigin-spatial-navigation` 3.3.0 / core 4.1.1 | optional (virtual by default) | no (`useFocusable` hook) | no | yes (depends on lodash-es) |
| BBC `@bbc/tv-lrud-spatial` 0.0.18 | yes (the app calls `focus()`) | yes (`nav`, `section`, `.lrud-container`, `data-block-exit`, `data-focus`) | no | yes |
| WICG `spatial-navigation-polyfill` 1.3.1 | yes | no (CSS custom properties) | no | yes |
| Microsoft `tabster` 8.8.1 | yes | yes (`data-tabster`, JSON valued) | no | yes |
| LG `@enact/spotlight` 5.6.0 | yes | partial (`data-spotlight-*`) | no | no (React) |

Real DOM focus is not a differentiator: eleven of the eighteen projects move the browser's real focus, and Norigin offers it as an option on top of that. What none of the eighteen does is call `navigator.getGamepads`. The full verified table, dated 2026-09-18, is in [docs/research/competitors.md](docs/research/competitors.md).

## Where it comes from

The engine is an extraction: it is inherited from the predecessor implementation ([ADR-0002](docs/adr/0002-license-and-copyright.md)) and not re-derived here. This repository is MIT, copyright Wesley Cormier; the licensing of the inherited code is [ADR-0002](docs/adr/0002-license-and-copyright.md). The predecessor is to become a consumer of this package and drop its own copy of the input system, leaving one engine to maintain rather than two; that is a plan in a repository this one cannot show, not a state it can demonstrate.

The engine already drives a documentation site with a gamepad: a site whose chrome is static markup rendered by the kit `@standardoc/kit`, a package that knows nothing about navigation. The only navigation code on that site is a four-line plugin setup arming `composite` mode — inherited from the predecessor implementation ([ADR-0002](docs/adr/0002-license-and-copyright.md)) and not re-derived here.

Two gamepad findings from running the engine on that site are inherited from the predecessor implementation ([ADR-0002](docs/adr/0002-license-and-copyright.md)) and not re-derived here; both are restated in full:

1. Some controls should be selected to enter and only then adjusted — a picker or a slider should take a confirm press before the directions start changing its value, instead of being adjusted the moment focus lands on it. This is what engage mode is for, and applying it to those controls is still open.
2. The right stick must scroll the page even when nothing is focused. Fixed here: the scroll target falls back to `document.scrollingElement` when no focused element has a scrollable ancestor (`pageScroller`, `src/spatial/spatial.ts:232-235`), covered by four browser tests (`src/spatial/spatial.browser.test.ts:317-384`).

A playground fixture is in this repository at `playground/index.html`, served by `bun run dev`. `playground/main.ts` imports the engine from `src/` rather than from the built package, so Vite compiles it and a change to the engine is on screen on the next reload with no build step between; it arms `app` mode, because `composite` on a laptop with no pad looks like nothing happening at all. A demo GIF and tests on real devices are roadmap items.

## Documentation

- [ROADMAP.md](ROADMAP.md) — what exists, what does not, in which order.
- [docs/adr/README.md](docs/adr/README.md) — the index of the twenty-one decision records, one file per decision, each with its evidence. The baseline is [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md), the package layout [ADR-0011](docs/adr/0011-package-layout-and-adapters.md).
- [docs/research/competitors.md](docs/research/competitors.md) — twenty fact sheets reconciled into 18 distinct projects, with their sources.
- [docs/research/tv-runtime-compatibility.md](docs/research/tv-runtime-compatibility.md) — browser and TV runtime versions, with their sources.
- [docs/specification.md](docs/specification.md) — the problem, the non-goals, the user contract, the numbered requirements and the gate each public claim has to pass.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). In one line: conventional commits, no AI co-author trailer, `bun` never `npm`, a test with every behaviour change, a blocking size-budget gate (`bun run check:size`, seven capped lines measured against the built `dist/`), code and documentation in English, and no claim in a document without the command, date or URL that proves it.

CI runs eight checks on every pull request, out of six jobs: lint, typecheck, build, the unit tests, a React peer-floor job, and the browser suite once per engine on chromium, firefox and webkit (`.github/workflows/ci.yml`). The build job builds, then checks that the build left the tree byte-identical — `tsdown` rewrites the exports map in `package.json`, so a drifted map is a failure and not a diff to commit afterwards — then lints the packed tarball and checks the size budgets. Five of the eight were reproduced here on 2026-09-20 and are green: `bun run lint`, `bun run typecheck`, `bun run build` followed by `git diff --exit-code`, `bun run check:package` and `bun run check:size`, `bun run test:unit`, and `bun run test:browser` on chromium. The firefox and webkit runs and the React 18.3 floor job cannot be exercised from a working tree — the floor job reinstalls React over the lockfile — so CI is what vouches for those three, on the pull request itself. The suite is 100 unit tests in 10 files, and 194 browser tests passed with 1 skipped in 11 files — 294 passed and 1 skipped in total (`bun run test:unit` and `bun run test:browser`, 2026-09-20). Behaviour in the project is [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md); a vulnerability goes through the process in [SECURITY.md](SECURITY.md), never a public issue.

## License

MIT, copyright Wesley Cormier. See [LICENSE](LICENSE).
