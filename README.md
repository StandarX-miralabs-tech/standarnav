# standarnav

Spatial navigation for the web: d-pad, gamepad sticks, TV remotes and arrow keys drive real DOM focus, declared in data attributes.

**Status:** `0.1.0` is on npm since 2026-09-22. The public API is not frozen and the `data-snav-*` attribute names are not final ([ADR-0001](docs/adr/0001-name-scope-and-attribute-prefix.md)); while the major is 0, a minor may break. See [ROADMAP.md](ROADMAP.md).

## What it does

- Moves the **real DOM focus**: the engine calls `focus()` and reads `document.activeElement`. No virtual cursor, no shadow focus state ([ADR-0005](docs/adr/0005-real-dom-focus.md)).
- Plain HTML becomes navigable through attributes; the application writes no navigation code for it.
- Arrow keys, d-pad buttons, the left stick and TV remote keys produce the same intent, so no move logic branches per device. The right stick scrolls.
- Containers nest and remember the element last focused in them. A container can wrap in one axis, block a direction, trap every exit, or redirect a direction to a CSS selector; when nothing is found, the engine scrolls one step and rescans once, which is how a virtualised list keeps producing rows.
- Two modes: `composite` (arrow keys stay inside composites, a gamepad crosses the page) and `app` (arrow keys navigate the whole page). `onWillMove` can veto a move; `onBoundsHit` fires when a direction has nowhere left to go.
- Zero runtime dependencies, ESM only, and every subpath sits under a size cap CI enforces: 3.13 kB min+gzip for the core and 12.40 kB for the whole package, by `bun run check:size` on 2026-09-22 ([ADR-0017](docs/adr/0017-size-budgets.md)).

## Usage

```sh
bun add @standarx/nav
```

```ts
import { createInputSystem } from "@standarx/nav";
import { gamepadPlugin } from "@standarx/nav/gamepad";
import { spatialPlugin } from "@standarx/nav/spatial";

const input = createInputSystem({ plugins: [gamepadPlugin(), spatialPlugin({ mode: "app" })] });
// later: input.destroy();
```

`mode: "app"` is what makes that snippet move on a keyboard. The default, `composite`, keeps arrow keys inside the composite that holds the focus, APG-strict, and only Tab crosses between composites; a gamepad has no Tab and crosses the page in either mode. Under `app` a hover also moves the focus, so a mouse and a pad do not fight over two cursors ([ADR-0007](docs/adr/0007-navigation-modes.md)).

| Attribute | Placed on | Value | Effect |
|---|---|---|---|
| `data-snav="container"` | any element | fixed | Declares a navigation container; moves are scored inside it first. |
| `data-snav-enter` | a container | `last` \| `first` \| `nearest` | Which element takes focus when a move enters. Default `last`. |
| `data-snav-wrap` | a container | `x` \| `y` \| `both`, or bare | Wraps to the opposite edge instead of leaving the container. |
| `data-snav-block` | a container | directions separated by spaces, or bare | Blocks those exits; bare blocks every one. |
| `data-snav-trap` | a container | bare | A move never leaves this container. |
| `data-snav-scroll` | a container | `center` | Scrolls a newly focused element to the centre instead of `nearest`. |
| `data-snav-ignore` | any element | bare | Excludes the element from the candidate list. |
| `data-snav-up` / `-down` / `-left` / `-right` | a focusable | a CSS selector | Sends that direction to the first match in the document, before any geometry runs. |

The attributes the engine writes back, for styling, are in [docs/en/attributes.md](docs/en/attributes.md); how a move is decided and what makes an element navigable are in [docs/en/navigation.md](docs/en/navigation.md).

## Subpaths

Import only what you use: the root entry pulls in no engine.

| Subpath | What it adds |
|---|---|
| `@standarx/nav` | `createInputSystem`, intent scopes, engage mode for controls that hold a value, the modality tracker, the focusability helpers, the types. |
| `@standarx/nav/spatial` | The engine that turns a direction into a focus move: `move`, `focus`, `focusFirst`, `onWillMove`, `onBoundsHit`. |
| `@standarx/nav/gamepad` | `navigator.getGamepads` polling: standard mapping, dead zones, repeat, rumble. |
| `@standarx/nav/focus-ring` | One overlay that follows `focusin`, painted inline, six custom properties — [docs/en/focus-ring.md](docs/en/focus-ring.md). |
| `@standarx/nav/keyboard` | An on-screen keyboard whose keys are real buttons the engine navigates; a layout is data in `/keyboard/qwerty`, `/keyboard/azerty` or `/keyboard/alphabetic` ([ADR-0022](docs/adr/0022-virtual-keyboard.md)). |
| `@standarx/nav/debug` | `explainMove`, the scored candidates of a move; `scanNativeSelects`, the closed `<select>`s a television cannot open. |
| `@standarx/nav/react` | `NavProvider` and the hooks — [docs/en/react.md](docs/en/react.md). |

## Frameworks

The core is the vanilla API and needs no framework. React is the adapter shipped today; a vanilla auto-mount helper, then Vue, Svelte and Angular adapters follow in that order ([ADR-0011](docs/adr/0011-package-layout-and-adapters.md)), each held to the same parity suite as React before it ships.

## Documentation

- [docs/en/](docs/en/): the attribute tables, how a move is decided and what makes an element navigable, React, the focus ring. Mirrored file by file in [docs/fr/](docs/fr/).
- [Playground](https://standarx-miralabs-tech.github.io/standarnav/): the fixture page, driven by keyboard and gamepad. `bun run dev` serves it from `src/`, and `playground/widgets.ts` holds the recipes for a slider, a stepper, a wheel picker, a listbox, a splitter and a native `<select>`.
- Browser support: Chromium 85, Safari 15 and Firefox 79 are the declared floor, television runtimes of 2020-2021 are best effort, and no television has been tested ([ADR-0013](docs/adr/0013-browser-baseline-and-fallbacks.md), [docs/research/tv-runtime-compatibility.md](docs/research/tv-runtime-compatibility.md)).
- [docs/specification.md](docs/specification.md): the problem, the non-goals, the requirements and the gate each public claim has to pass. [docs/adr/README.md](docs/adr/README.md): every decision with its evidence — package layout [ADR-0011](docs/adr/0011-package-layout-and-adapters.md), versioning and release [ADR-0012](docs/adr/0012-versioning-and-release.md).
- [docs/research/competitors.md](docs/research/competitors.md): eighteen projects compared on real focus, attributes, gamepad and framework independence, with sources.
- Where it comes from: the engine is extracted from a predecessor implementation, identified in [ADR-0002](docs/adr/0002-license-and-copyright.md) and nowhere else.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md), in one line: conventional commits, `bun` never `npm`, a test with every behaviour change, blocking size budgets, English only, and no claim in a document without the command, date or URL that proves it. CI runs eight checks on every pull request: lint, typecheck, build with the packaging and size gates, unit tests, a React 18.3 floor, and the browser suite on chromium, firefox and webkit. Conduct is [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md); a vulnerability goes through [SECURITY.md](SECURITY.md), never a public issue.

## License

MIT, copyright Wesley Cormier. See [LICENSE](LICENSE).
