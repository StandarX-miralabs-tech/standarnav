# ADR-0001: Name, npm scope and attribute prefix

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

The input system extracted from miralabs-ui (see [ADR-0003](0003-extraction-scope.md))
needs three names before the repository can exist: a project name, an npm
package identifier, and a prefix for the DOM attributes the engine reads and
writes. The constraints were fixed before any candidate was generated:

| Constraint | Why |
|---|---|
| Pronounceable in French and English, no oral ambiguity | The owner speaks both; the name has to survive being said out loud. |
| Short attribute prefix | The prefix appears in every consumer's markup, repeated on every container and every focusable element. |
| Free on npm (unscoped and scoped), free as a GitHub repository, no significant product collision | A name already taken is a rename later. |
| Coherent with the StandarX family | The owner's other projects are standardoc, standarflow, standarlua, standarcli. |
| Not a device word only | The library drives navigation from a keyboard, a gamepad and a TV remote: `packages/core/src/input/keymap.ts:80-84` maps webOS Back 461, Tizen Return 10009, Tizen Exit 10182 and channel up/down 427/428 (read 2026-09-18). |

The last constraint is the owner's own: navigation is pad, keyboard and remote,
not only pad. It disqualifies any name built solely on the gamepad.

Forty-eight candidates were checked with the same protocol on 2026-09-18: 29
free, 8 risky, 11 taken. Three independent judges — product, developer
experience, risk — scored the shortlist out of 10. The protocol, the commands and the full candidate table are published in
[docs/research/name-availability-2026-09-18.md](../research/name-availability-2026-09-18.md).

## Decision

| Item | Value |
|---|---|
| Project name | `standarnav` |
| GitHub repository | `StandarX-miralabs-tech/standarnav` |
| npm package | `@standarx/nav` |
| Attribute prefix | `data-snav-*` |
| CSS custom properties | `--snav-focus-ring-*` |

One package, subpath exports: `@standarx/nav` (core), `/gamepad`, `/spatial`,
`/focus-ring`, `/debug`, and the adapters `/react`, `/vue`, `/svelte`, `/angular`.
`vanilla` is the core itself. The package is unreleased; v0 is in progress.

Attributes read from the markup: `data-snav="container"`, `data-snav-enter`,
`data-snav-wrap`, `data-snav-block`, `data-snav-trap`, `data-snav-scroll`,
`data-snav-ignore`, `data-snav-up/down/left/right`. Names written by the engine:

| Name | Written on | Replaces (miralabs-ui) |
|---|---|---|
| `data-snav-focused` | the focused element | `data-focused` |
| `data-snav-active` | every container on the active path | `data-nav-active` |
| `data-snav-input` | `<html>`, modality: keyboard, pointer, touch, gamepad | `data-mira-input` |
| `data-snav-focus-ring` | the focus ring overlay | `data-mira-focus-ring` |
| `--snav-focus-ring-*` | CSS custom properties read by the overlay | `--mira-focus-ring-*` |

Two of them change category, not just prefix: `data-focused` and `data-nav-active`
are unprefixed in the source
(`packages/core/src/input/spatial/containers.ts:17-18`).

## Consequences

- miralabs-ui must rename every read and written attribute when it adopts this
  package. Counted in the source at commit `289fa607` on 2026-09-18:
  `grep -rl data-mira-nav packages/core/src/components --include=*.ts` covers
  fourteen components once test files are removed, and
  `grep -rl data-mira-input packages/styles/scss --include=*.scss` returns nine
  files. Coordinated breaking change, tracked in
  [ADR-0004](0004-relationship-with-miralabs-ui.md).
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
research of 2026-09-18, published in
[docs/research/name-availability-2026-09-18.md](../research/name-availability-2026-09-18.md)
(candidate table, judge panel, and the `snav` probe run after the panel).

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

Availability protocol, run per candidate on 2026-09-18 (18:00 to 19:50 UTC) and published in
[docs/research/name-availability-2026-09-18.md](../research/name-availability-2026-09-18.md).
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
repository (`.github`), 2 followers, blog standarx.com live (2026-09-18; "Known
risks and follow-ups" in
[docs/research/name-availability-2026-09-18.md](../research/name-availability-2026-09-18.md)).
No formal trademark search (INPI, EUIPO, USPTO) was made for any candidate, so that dimension is unverified.

Judge scores, overall ranking table of the same document:
standarnav 23/30, padnav 22.5/30, standarpad 21.3/30, focon 19/30, joyko 19/30.

Attribute names in the source, read 2026-09-18 at commit `289fa607`:
`packages/core/src/input/spatial/containers.ts:10-18`,
`packages/core/src/interaction/modality.ts:20`,
`packages/core/src/input/focus-ring/focus-ring.ts:26`, `:84` and `:112`.

Related: [ADR-0002](0002-license-and-copyright.md),
[ADR-0003](0003-extraction-scope.md), [ADR-0004](0004-relationship-with-miralabs-ui.md).
