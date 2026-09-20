# ADR-0001: Name, npm scope and attribute prefix

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

The extracted input system (see [ADR-0003](0003-package-boundaries.md))
needs three names before the repository can exist: a project name, an npm
package identifier, and a prefix for the DOM attributes the engine reads and
writes. The constraints were fixed before any candidate was generated:

| Constraint | Why |
|---|---|
| Pronounceable in French and English, no oral ambiguity | The owner speaks both; the name has to survive being said out loud. |
| Short attribute prefix | The prefix appears in every consumer's markup, repeated on every container and every focusable element. |
| Free on npm (unscoped and scoped), free as a GitHub repository, no significant product collision | A name already taken is a rename later. |
| Coherent with the StandarX family | The owner's other projects are standardoc, standarflow, standarlua, standarcli. |
| Not a device word only | The library drives navigation from a keyboard, a gamepad and a TV remote: `REMOTE_KEY_CODES` in `src/keymap.ts:80-84` maps webOS Back 461, Tizen Return 10009, Tizen Exit 10182 and channel up/down 427/428. |

The last constraint is the owner's own: navigation is pad, keyboard and remote,
not only pad. It disqualifies any name built solely on the gamepad.

Forty-eight candidates were checked with the same protocol on 2026-09-18: 29
free, 8 risky, 11 taken. Three independent judges — product, developer
experience, risk — scored the shortlist out of 10.

## Decision

| Item | Value |
|---|---|
| Project name | `standarnav` |
| GitHub repository | `StandarX-miralabs-tech/standarnav` |
| npm package | `@standarx/nav` |
| Attribute prefix | `data-snav-*` |
| CSS custom properties | `--snav-focus-ring-*`, `--snav-keyboard-*` |

One package, subpath exports: `@standarx/nav` (core), `/gamepad`, `/spatial`,
`/focus-ring`, `/debug`, and the adapters `/react`, `/vue`, `/svelte`, `/angular`.
`vanilla` is the core itself. The package is unreleased; v0 is in progress.

Attributes read from the markup: `data-snav="container"`, `data-snav-enter`,
`data-snav-wrap`, `data-snav-block`, `data-snav-trap`, `data-snav-scroll`,
`data-snav-ignore`, `data-snav-up/down/left/right`. Names written by the engine:

| Name | Written on |
|---|---|
| `data-snav-focused` | the focused element |
| `data-snav-active` | every container on the active path |
| `data-snav-input` | `<html>`, modality: keyboard, pointer, touch, gamepad |
| `data-snav-focus-ring` | the focus ring overlay |
| `data-snav-editing` | the field the on-screen keyboard is open on ([ADR-0022](0022-virtual-keyboard.md)) |
| `data-snav-keyboard` | the keyboard's box, carrying the layout's id as its value |
| `data-snav-keyboard-row` | each row of keys; `[data-snav-keyboard-row] button` is a key and nothing else is |
| `data-snav-keyboard-preview` | the preview row at the bottom of the box, the focusable mirror of the field |
| `data-snav-keyboard-caret` | the caret drawn inside the preview row |
| `--snav-focus-ring-*` | six CSS custom properties: `offset`, `duration` and `easing`, read by the overlay, plus `color`, `width` and `z-index`, substituted into its inline style |
| `--snav-keyboard-*` | five CSS custom properties substituted into the box's inline style: `z-index`, `font-size`, `color`, `background` and `shadow` |

`data-snav-editing` is the one addition that is **not** a rename. It was added on 2026-09-20 with the
keyboard, and it exists because the keys take the focus, so the field being typed into is not
`:focus` and an application has nothing else to style the editing state against. It is frozen at v1
with the rest.

Every one of the other five is a rename: the names these replace were inherited from the predecessor
implementation ([ADR-0002](0002-license-and-copyright.md)) and not re-derived here. Two of
them change category and not merely prefix — the focused and active markers carried no namespace
at all before extraction, so the prefix is new surface rather than a substitution, and both are
now declared as constants at `src/spatial/containers.ts:17-18` (`FOCUSED_ATTRIBUTE`,
`ACTIVE_ATTRIBUTE`).

**Amended 2026-09-20: the custom-property contract is six names, not five.** The row above read
five until the focus ring was reviewed before merge. The sixth is `--snav-focus-ring-z-index`,
fallback `1700`, and it exists because the overlay is `position: fixed`, which opens no stacking
context: without a `z-index` of its own the ring paints at the root level in DOM order and goes
behind the first dialog it meets. `1700` is the rung the ring sat on above modal, popover, toast
and tooltip: that ordering is inherited from the predecessor implementation
([ADR-0002](0002-license-and-copyright.md)) and not re-derived here, so the number is inherited
rather than invented — but no stylesheet ships with this package
([ADR-0020](0020-focus-ring-defaults.md)), which is why the plugin carries it inline. The same
review moved the `width` fallback from `2px` to `3px`, which changes no name and so does not
change the contract.

Six names is the frozen number for v0, and each is a public contract on the same terms as the
attributes: adding one is a minor change, renaming or removing one is breaking. They appear at
`src/focus-ring/focus-ring.ts:51-52` (`RING_PAINT`: `z-index`, `width`, `color`), `:104-106`
(`offset`, in `measure`) and `:134-137` (`duration` and `easing`, in `motion`).

**Amended 2026-09-21: the keyboard's names, which the table had not caught up with.** The
on-screen keyboard writes attributes of its own on elements it creates, the way the focus ring
writes `data-snav-focus-ring` on its overlay, and two of them had shipped without a row here:
`data-snav-keyboard`, whose value is the layout's id, and `data-snav-keyboard-row`. Two more
arrive with the preview row of [ADR-0022](0022-virtual-keyboard.md)'s amendment of the same
day: `data-snav-keyboard-preview` and `data-snav-keyboard-caret`. All four are declared as
constants next to `EDITING_ATTRIBUTE` in `src/keyboard/keyboard.ts`, as the evidence below
requires of every name, rather than written through `dataset`. The engine therefore writes
**nine** attribute names, not five, and `data-snav-editing` is no longer the one addition.

The custom-property contract was never six names either, once the keyboard painted its own box:
`--snav-keyboard-z-index`, `-font-size`, `-background` and `-shadow` arrived with that amendment,
and `--snav-keyboard-color` with the preview row — the box declared a background and no colour,
which on a light page painted the page's text colour onto it. That is **eleven** custom
properties in two families, frozen at v1 on the same terms: adding one is a minor change,
renaming or removing one is breaking. The Decision table names both families.

## Consequences

- The prefix is a public contract from the first release; changing it later is a
  major version for every consumer's HTML and CSS.
- `standar` without the `d` is a permanent typo trap for English speakers, the
  devex judge's main objection. Mitigation: the import path is `@standarx/nav`,
  not the project name, and the attribute prefix is `snav`. The scope also covers
  the whole family, so a future `@standarx/doc` needs no namespace decision.
- **Known risk, brand level, not project level.** A third-party GitHub org
  `standarx` exists since 2024-12-24: Brazil, 1 repository `.github`, 2
  followers, site standarx.com live (`gh api users/standarx`, 2026-09-18). It
  precedes `StandarX-miralabs-tech`, created 2026-09-18. No INPI, EUIPO or USPTO
  trademark search has been done for any candidate. Follow-up: run a formal
  search on the StandarX family before any commercial use of the name.
- Availability is not possession. Publishing a 0.0.0 placeholder to claim
  `@standarx/nav` on the registry is an open action, not done yet.

## Alternatives considered

Scores, collision facts and star counts below come from the name-availability
research of 2026-09-18.

| Candidate | Score (product + devex + risk) | Why not |
|---|---|---|
| `padnav` | 22.5/30 (7.5 + 7.5 + 7.5) | Best developer experience of the shortlist: six characters, no typo possible, `data-pnav-*` grep-clean. Rejected on the owner's constraint — "pad" names one input device out of three. The risk judge also found two 0-star GitHub repositories, one named `PadNav`, a gamepad browser for Windows 11: functionally adjacent, no audience. |
| `standarpad` | 21.3/30 (7 + 5.5 + 8.8) | Same device-only objection, plus the `standar` typo trap without padnav's compensating brevity. Risk judge flagged visual proximity with "iPad" in a marketing context (no trademark analysis done). |
| `focon` | 19/30 (7 + 7.5 + 4.5) | Five letters, excellent ergonomics, npm free. Rejected on a real trademark collision: FOCON Electronic Systems ApS (Luminator group), roughly 25 years in railway display systems, plus focon.app and focon.js.org taken. |
| `joyko` | 19/30 (6.5 + 8 + 4.5) | Best attribute ergonomics of all 48 (`data-joy-*`, three characters). Rejected: Joyko is a widely distributed Indonesian stationery brand (joyko.co.id, Walmart, Tokopedia, Shopee); a filing is very likely even in another class (unverified), and the token's searchability is already captured. |

Also scored and rejected: `standarfocus` 18.5 (the "focus" token is saturated by
focus-trap, focus-visible, focus-lock), `standarstick` 18.7, `standarkey` 18.5
("key" reads as API key), `azimut` (Azimutt, 2181 stars), `rudder` (npm 0.0.6), `snav` (imsyy/SNav, 441 stars).

The judges disagreed, which is why this is recorded. `padnav` won developer
experience (7.5 against 6), `standarnav` won risk (9.5 against 7.5): the devex
judge reads `standar` as a typo trap, the risk judge reads `standarnav` as a
unique web token. The owner broke the tie on the product constraint.

## Evidence

Availability protocol, run per candidate on 2026-09-18 (18:00 to 19:50 UTC).
Verbatim commands and outputs for the `standarnav` entry:

```powershell
try { (Invoke-WebRequest -Uri "https://registry.npmjs.org/standarnav" -UseBasicParsing -ErrorAction Stop).StatusCode } catch { $_.Exception.Response.StatusCode.value__ }
# STATUS:404
try { (Invoke-WebRequest -Uri "https://registry.npmjs.org/%40standarx%2Fstandarnav" -UseBasicParsing -ErrorAction Stop).StatusCode } catch { $_.Exception.Response.StatusCode.value__ }
# STATUS:404
foreach ($n in @("standar-nav","standard-nav","standarnav-js","standar_nav")) { try { (Invoke-WebRequest -Uri "https://registry.npmjs.org/$n" -UseBasicParsing -ErrorAction Stop).StatusCode } catch { $_.Exception.Response.StatusCode.value__ } }
# standar-nav STATUS:404 / standard-nav STATUS:404 / standarnav-js STATUS:404 / standar_nav STATUS:404
gh api repos/StandarX-miralabs-tech/standarnav
# gh: Not Found (HTTP 404) {"message":"Not Found","documentation_url":"https://docs.github.com/rest/repos/repos#get-a-repository","status":"404"}
gh search repos "standarnav" --match name --limit 15 --json fullName,stargazersCount,description,url --sort stars
# [] (empty list, no repository found)
try { (Invoke-WebRequest -Uri "https://standarnav.js.org" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop).StatusCode } catch { "ERROR" }
# js.org STATUS:200 (inconclusive, to be revalidated: may be a generic GitHub Pages catch-all)
try { (Invoke-WebRequest -Uri "https://standarnav.dev" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop).StatusCode } catch { $_.Exception.Message }
# dev ERROR: unknown host (standarnav.dev:443) -- DNS only, no WHOIS or registrar lookup
# WebSearch "standarnav" library / software / npm -> no library, product or package.
```

Recorded verdict for `standarnav`: `free`. The package that will be published was
checked separately on 2026-09-18: `registry.npmjs.org/@standarx%2Fnav` → 404, npm
scope search `scope:standarx` → 0 packages.

Third-party org, `gh api users/standarx`: created 2024-12-24, Brazil, 1
repository (`.github`), 2 followers, blog standarx.com live (2026-09-18).
No formal trademark search (INPI, EUIPO, USPTO) was made for any candidate, so that dimension is unverified.

Judge scores, overall ranking:
standarnav 23/30, padnav 22.5/30, standarpad 21.3/30, focon 19/30, joyko 19/30.

The attribute names are declared as constants in this repository, not spelled inline at their
call sites: `src/spatial/containers.ts:10-18` (`CONTAINER_SELECTOR` through `ACTIVE_ATTRIBUTE`),
`src/modality.ts:19` (`MODALITY_ATTRIBUTE`) and `src/focus-ring/focus-ring.ts:26`
(`RING_ATTRIBUTE`), which is what makes a rename a single edit rather than a grep.

Related: [ADR-0002](0002-license-and-copyright.md),
[ADR-0003](0003-package-boundaries.md), [ADR-0020](0020-focus-ring-defaults.md).
