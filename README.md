# standarnav

Spatial navigation for the web: d-pad, gamepad sticks, TV remotes and arrow keys drive real DOM focus, declared in data attributes.

**Status:** unreleased. The engine is being extracted from miralabs-ui; the public API is not frozen, the attribute names of this repository are not yet the ones in the source, and nothing is published on npm. See [ROADMAP.md](ROADMAP.md).

## What it does

- Moves the real DOM focus: the engine calls `element.focus({ preventScroll: true })` and reads `document.activeElement` (miralabs-ui `packages/core/src/input/spatial/spatial.ts:278` and `:220-221`). Every path below cites that repository, read 2026-09-18.
- Plain HTML becomes navigable through attributes; the application writes no navigation code for it (`packages/core/src/input/spatial/containers.ts:1-6`, header comment).
- Keyboard arrows, d-pad buttons, the left analog stick and TV remote keys produce the same intent events; the consumer of an intent cannot tell which device sent it.
- The right stick scrolls: the focused element's scroll container first, the document's `scrollingElement` when nothing else scrolls (`spatial.ts:175-189`, `pageScroller`).
- Containers nest, and each container remembers the element that was focused in it (`WeakMap<HTMLElement, WeakRef<HTMLElement>>`, `spatial.ts:198` and `:235`).
- A container can wrap in one axis, block a direction, trap every exit, or redirect a direction to a CSS selector.
- When no candidate is found, the engine scrolls one step and rescans once on the next frame, which is how a virtualised list keeps producing rows (`spatial.ts:327-351`). No test covers this path today.
- Two modes: `composite` (arrow keys stay inside composites, a gamepad crosses the page) and `app` (arrow keys navigate the whole page). The plugin ignores keyboard arrows outright in `composite` mode (`spatial.ts:69-72` and `:437`).
- `onWillMove` can veto a move before focus changes; `onBoundsHit` fires when a direction has nowhere left to go.
- A focus ring is an optional plugin: a WAAPI overlay that follows `focusin`, off unless you mount it.
- `explainMove` returns the scored candidate list of a move, for debugging (`packages/core/src/input/spatial/debug.ts`). No test covers it today.

## Install

Not published yet. Once it is published, the intended form is:

```sh
bun add @standarx/nav
```

The name is free as of 2026-09-18: a GET on `https://registry.npmjs.org/@standarx%2Fnav` answered 404 that day.

While the major stays 0, a minor may break: the snippet above pins an exact minor once a 0.x exists ([ADR-0012](docs/adr/0012-versioning-and-release.md)).

## Usage

The intended setup, once the package exists:

```ts
import { createInputSystem } from "@standarx/nav";
import { gamepadPlugin } from "@standarx/nav/gamepad";
import { spatialPlugin } from "@standarx/nav/spatial";

const input = createInputSystem({ plugins: [gamepadPlugin(), spatialPlugin({ mode: "composite" })] });
```

`createInputSystem` owns the keyboard source and the scope stack; it is an instance, never a global singleton. `input.destroy()` tears it down (`packages/core/src/input/input-system.ts:68` and `:209-211`).

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

The source engine in miralabs-ui reads `data-mira-nav-*` and writes `data-focused` / `data-nav-active` / `data-mira-input` / `data-mira-focus-ring`; the `data-snav-*` names above belong to this extraction and are part of what is not frozen yet.

## How a move is decided

For one direction, starting from `document.activeElement` (`spatial.ts:353-393`):

1. **Redirect.** If the focused element carries `data-snav-<direction>`, the selector is resolved on the whole document and the move ends there.
2. **Geometry.** Candidates are collected in the nearest declared container. A nested container counts as one candidate, scored as a single rectangle, not as all of its children. The best-aligned candidate wins; ties go to DOM order.
3. **Wrap.** If the container wraps in this axis, the move lands on the opposite edge.
4. **Scroll and rescan.** If something can still scroll in this direction, the engine scrolls one step and retries once on the next frame. Only once, or a list with no reachable end would scroll to the bottom on a single press.
5. **Step out.** The walk moves to the parent container and repeats from step 2 — unless the container traps, blocks this direction, or is the root.

When the walk ends with nothing, `onBoundsHit(direction)` fires and the move returns `false`.

## Make your element navigable

- The engine sees what the platform sees: it collects elements matching the focusable selector (`input`, `select`, `textarea`, `button`, `a[href]`, `[contenteditable]`, `[tabindex]`, and the rest of `packages/core/src/focus/tabbable.ts`).
- A `div` with an `onclick` is not focusable. Give it `tabindex="0"`, or use a real `button`.
- `aria-hidden` is deliberately not filtered: it hides an element from a screen reader, not from the d-pad. Use `data-snav-ignore`, `inert`, or `display: none`.
- `aria-disabled` stays a candidate, on purpose, because the APG wants disabled items reachable (`tabbable.ts:56`); `inert` ancestors (`tabbable.ts:49`) and elements hidden per `checkVisibility` (`tabbable.ts:41-43`) are dropped.
- Elements of zero width **and** zero height are dropped; the candidate filter tests `width === 0 && height === 0`, so a 0 by 40 element is still a candidate (`spatial.ts`, candidate filter, read 2026-09-18). When a move surprises you, read the scored list with `explainMove`.

## Browser support

Baseline decision and evidence: [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md). The runtime versions below come from Samsung "Web Engine Specifications" and LG "Web API and Web Engine", fetched 2026-09-18; the full table with URLs is in [docs/research/tv-runtime-compatibility.md](docs/research/tv-runtime-compatibility.md).

| Tier | Runtimes | What it means |
|---|---|---|
| Supported | Chromium ≥ 85, Safari ≥ 15, Firefox ≥ 79 | The declared floor of ADR-0013. The build target is es2020. |
| Best effort | TV 2020-2021: Tizen 5.5 / 6.0 (Chromium 69 / 76), webOS 5.x / 6.x (Chromium 68 / 79) | The es2020 output does not parse below Chromium 80. A separate legacy build is a roadmap question, not a v0 promise. |

The es2020 syntax floor is Chrome 80, Safari 13.1, Firefox 74, Samsung Internet 13.0: it is set by optional chaining ([caniuse](https://caniuse.com/mdn-javascript_operators_optional_chaining)) and nullish coalescing ([caniuse](https://caniuse.com/mdn-javascript_operators_nullish_coalescing)), fetched 2026-09-18. A runtime below that line does not parse the output at all, which is why the second tier is best effort and not support.

The CI browser matrix runs chromium, firefox and webkit at the versions Playwright ships (`.github/workflows/ci.yml`, job `browser`). It does not run the floor versions of the table, and it has no test to run yet: `src/` does not exist in this repository.

Three modern APIs sit above that floor: `WeakRef` (Chrome 84, Safari 14.1, Firefox 79), `checkVisibility` (Chrome 105, Safari 17.4, Firefox 106), `inert` (Chrome 102, Safari 15.5, Firefox 112) — MDN browser-compat data, fetched 2026-09-18. In the source engine only `checkVisibility` and `inert` degrade; `WeakRef` has no fallback and `Array.prototype.at` is undefined below Chrome 92, Safari 15.4, Firefox 90 ([caniuse](https://caniuse.com/mdn-javascript_builtins_array_at), fetched 2026-09-18). Feature detection with a fallback for the first three, and the removal of `Array.prototype.at` outright, is a decision of [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md), not code that exists today.

**No television, set-top box or handheld has been tested.** The default keymap carries webOS and Tizen remote key codes only: webOS Back 461, Tizen Return 10009, Tizen Exit 10182, channel up and down 427 and 428 (`packages/core/src/input/keymap.ts:80-84`). There is nothing for Vidaa, Vizio, Roku, Fire TV or Android TV.

## Comparison

Twenty fact sheets were built source-first on 2026-09-18, covering 18 distinct projects (two of them were sheeted twice under two names); the versions named below were read on npm the same day. Six projects, on the four axes that matter here:

| Library | Real DOM focus | Attributes on plain HTML | Gamepad API | Framework-agnostic core |
|---|---|---|---|---|
| standarnav (as designed) | yes | yes | yes | yes |
| Norigin `norigin-spatial-navigation` 3.3.0 / core 4.1.1 | optional (virtual by default) | no (`useFocusable` hook) | no | yes (depends on lodash-es) |
| BBC `@bbc/tv-lrud-spatial` 0.0.18 | yes (the app calls `focus()`) | yes (`nav`, `section`, `.lrud-container`, `data-block-exit`, `data-focus`) | no | yes |
| WICG `spatial-navigation-polyfill` 1.3.1 | yes | no (CSS custom properties) | no | yes |
| Microsoft `tabster` 8.8.1 | yes | yes (`data-tabster`, JSON valued) | no | yes |
| LG `@enact/spotlight` 5.6.0 | yes | partial (`data-spotlight-*`) | no | no (React) |

Real DOM focus is not a differentiator: eleven of the eighteen projects move the browser's real focus, and Norigin offers it as an option on top of that. What none of the eighteen does is call `navigator.getGamepads`. The full verified table, dated 2026-09-18, is in [docs/research/competitors.md](docs/research/competitors.md).

## Where it comes from

This is an extraction from [miralabs-ui](https://github.com/miralabs-tech/miralabs-ui), a headless component library, at commit `289fa607` (repository state read 2026-09-18). Both repositories are MIT: miralabs-ui is copyright MiraLabs, this one is copyright Wesley Cormier. miralabs-ui becomes a consumer of this package and deletes its own copy of the input system, so there is one engine to maintain rather than two.

The engine already drives a documentation site with a gamepad: the miralabs-ui documentation site, whose chrome is static markup rendered by the kit `@standardoc/kit`, a package that knows nothing about navigation. The only navigation code on that site is the four-line plugin setup in `apps/docs/client/gamepad.ts`, which arms `composite` mode (read in miralabs-ui at commit `289fa607` on 2026-09-18).

A maintainer review of that site on 2026-09-14 recorded two gamepad findings. That review is not a document of this repository, and it was deleted from miralabs-ui by commit `289fa607`; both findings are restated here in full so nothing depends on it:

1. Some controls should be selected to enter and only then adjusted — a picker or a slider should take a confirm press before the directions start changing its value, instead of being adjusted the moment focus lands on it. This is what engage mode is for, and applying it to those controls is still open.
2. The right stick must scroll the page even when nothing is focused. Fixed in the source engine: the scroll target falls back to `document.scrollingElement` when no focused element has a scrollable ancestor (`pageScroller`), covered by four browser tests.

A playground fixture is in this repository at `playground/index.html`, served by `bun run dev`; the engine is not wired into it, because `src/` does not exist yet (`playground/main.ts`). A demo GIF and tests on real devices are roadmap items.

## Documentation

- [ROADMAP.md](ROADMAP.md) — what exists, what does not, in which order.
- [docs/adr/README.md](docs/adr/README.md) — the index of ADR-0001 to ADR-0019, one file per decision, each with its evidence. The baseline is [ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md), the package layout [ADR-0011](docs/adr/0011-package-layout-and-adapters.md).
- [docs/research/competitors.md](docs/research/competitors.md) — twenty fact sheets reconciled into 18 distinct projects, with their sources.
- [docs/research/tv-runtime-compatibility.md](docs/research/tv-runtime-compatibility.md) — browser and TV runtime versions, with their sources.
- [docs/specification.md](docs/specification.md) — the problem, the non-goals, the user contract, the numbered requirements and the gate each public claim has to pass.
- [docs/journal/](docs/journal/) — what was done, day by day.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). In one line: conventional commits, no AI co-author trailer, `bun` never `npm`, a test with every behaviour change, a blocking size-budget gate (`bun run check:size`, a script that measures every published entry but carries no cap yet, so it fails and prints the numbers until the first caps are written), code and documentation in English, and no claim in a document without the command, date or URL that proves it. Behaviour in the project is [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md); a vulnerability goes through the process in [SECURITY.md](SECURITY.md), never a public issue.

## License

MIT, copyright Wesley Cormier. See [LICENSE](LICENSE).
