# Name availability check, 2026-09-18

This document records the name-availability research carried out on 2026-09-18, between roughly 18:00 and 19:50 UTC, for the naming of the new StandarX directional-navigation library (d-pad / gamepad / keyboard focus navigation, formerly referred to internally by a "mira-nav" style prefix). 48 candidate names were generated and checked for collisions on the npm registry (unscoped and scoped under `@standarx`), on GitHub (inside the `StandarX-miralabs-tech` organisation and across public repositories), on the general web, and on the `.dev` and `.js.org` domains. Three independent judges then scored a shortlist on product clarity, developer ergonomics, and collision risk. All statuses, HTTP codes, and search results below are snapshots taken on 2026-09-18 and are only valid as of that date — npm, GitHub, and web state can change at any time afterward.

## Protocol

For each candidate name, the following checks were run:

- **npm unscoped** — HTTP request to `https://registry.npmjs.org/<name>`. A `404` means the name is free; a `200` means it is already taken.
- **npm similar-name variants** — the same HTTP check repeated against hyphen/underscore variants of the name (e.g. `foo-bar`, `foo_bar`), to anticipate npm's own similar-name rule, which can block publication of a name that is "confusingly similar" to an existing package even when the exact name is free.
- **npm scoped** — the same HTTP check against `https://registry.npmjs.org/@standarx%2F<name>`, to confirm the name is also free under the `@standarx` scope.
- **GitHub organisation repo** — `gh api repos/StandarX-miralabs-tech/<name>`. A `404` means no repository of that name exists yet inside the organisation.
- **GitHub-wide search** — `gh search repos "<name>" --match name --limit 15 --sort stars`, to surface any existing public repository with the exact name, ranked by star count.
- **Web search** — a general web search for the name as a product, brand, or software library, to catch collisions that npm/GitHub would not reveal (e.g. a commercial app or a company brand of the same name).
- **`.dev` domain** — a DNS resolution probe of `<name>.dev`.
- **`.js.org` domain** — an HTTP probe of `<name>.js.org`. An HTTP 200 response here is treated as inconclusive by itself, because js.org serves an identical catch-all status page for many unregistered subdomains; a 200 only counts as a real collision when the page content is confirmed to be a genuine, distinct published page.

**Verdict rule:**
- **free** — npm unscoped free AND npm scoped free AND GitHub org repo free AND no high-severity web collision AND no exact-name GitHub repository with 200 stars or more.
- **taken** — npm unscoped taken OR GitHub org repo taken.
- **risky** — everything else (a real but lower-severity collision on web, GitHub, or elsewhere).

No formal trademark search (INPI, EUIPO, USPTO) was performed for any candidate under this protocol.

## Result for the chosen name, standarnav

`standarnav` (proposed attribute prefix: `snav`) was checked with the following commands, verbatim:

| # | Command | Output excerpt |
|---|---------|-----------------|
| 1 | `Invoke-WebRequest -Uri "https://registry.npmjs.org/standarnav"` | `STATUS:404` |
| 2 | `Invoke-WebRequest -Uri "https://registry.npmjs.org/%40standarx%2Fstandarnav"` | `STATUS:404` |
| 3 | Loop over variants `standar-nav`, `standard-nav`, `standarnav-js`, `standar_nav` against `https://registry.npmjs.org/<variant>` | `standar-nav STATUS:404` / `standard-nav STATUS:404` / `standarnav-js STATUS:404` / `standar_nav STATUS:404` |
| 4 | `gh api repos/StandarX-miralabs-tech/standarnav` | `gh: Not Found (HTTP 404)` — `{"message":"Not Found","documentation_url":"https://docs.github.com/rest/repos/repos#get-a-repository","status":"404"}` |
| 5 | `gh search repos "standarnav" --match name --limit 15 --json fullName,stargazersCount,description,url --sort stars` | `[]` (no repository found, empty list) |
| 6 | `Invoke-WebRequest -Uri "https://standarnav.js.org"` | `js.org STATUS:200` (inconclusive, needs manual re-validation) |
| 7 | `Invoke-WebRequest -Uri "https://standarnav.dev"` | `dev ERROR: Unknown host. (standarnav.dev:443)` |
| 8 | WebSearch: `"standarnav" library` / `"standarnav" software` / `"standarnav" npm` | No relevant result: all three searches returned no existing library, product, or package named standarnav (unrelated matches only: physical libraries, ScanNav, StarNav, AstraNav, Dynamics NAV, generic nav/navbar npm packages) |

Two additional checks were run beyond the standard per-candidate protocol, specifically for the chosen name:

- `https://registry.npmjs.org/@standarx%2Fnav` → HTTP 404 on 2026-09-18 (the shorter `@standarx/nav` scoped name is also free).
- `https://registry.npmjs.org/-/v1/search?text=scope:standarx&size=20` → 0 packages returned (the `@standarx` scope has no published packages at all as of 2026-09-18).
- `gh api repos/StandarX-miralabs-tech/standarnav` → HTTP 404 (repeated confirmation; see row 4 above).

**Verdict: free.** No npm collision (unscoped or scoped), no GitHub repository in the organisation or elsewhere, no web collision, and both candidate domains are either unresolved (`.dev`) or inconclusive (`.js.org`).

## Runner-up evidence

### padnav

Proposed attribute prefix: `pnav`.

| # | Command | Output excerpt |
|---|---------|-----------------|
| 1 | `Invoke-WebRequest -Uri "https://registry.npmjs.org/padnav"` | `404` |
| 2 | `Invoke-WebRequest -Uri "https://registry.npmjs.org/pad-nav"` | `404` |
| 3 | `Invoke-WebRequest -Uri "https://registry.npmjs.org/%40standarx%2Fpadnav"` | `404` |
| 4 | `gh api repos/StandarX-miralabs-tech/padnav` | `{"message":"Not Found","documentation_url":"https://docs.github.com/rest/repos/repos#get-a-repository","status":"404"}` — `gh: Not Found (HTTP 404)` |
| 5 | `gh search repos "padnav" --match name --limit 15 --json fullName,stargazersCount,description,url --sort stars` | `[{"description":"PadNav is a lightweight gamepad browser navigation app for Windows 11","fullName":"qianqianzhihe/PadNav","stargazersCount":0,"url":"https://github.com/qianqianzhihe/PadNav"},{"description":"pad-side sidebar","fullName":"xulong20130712/padnavigation","stargazersCount":0,"url":"https://github.com/xulong20130712/padnavigation"}]` |
| 6 | `Invoke-WebRequest -Uri "https://padnav.js.org"` | `js.org: 200` (HTML page titled "302 padnav - JS.ORG", the typical catch-all behaviour for an unregistered subdomain) |
| 7 | `Invoke-WebRequest -Uri "https://padnav.dev"` | `dev error: Unknown host. (padnav.dev:443)` |
| 8 | WebSearch: `"padnav" library` / `"padnav" software` / `"padnav" npm` | No library, brand, or software product called "padnav" identified; only unrelated matches (Padlet, PAD System, pad-left npm, PADICAT, etc.) |

Domain note: `padnav.dev` failed DNS resolution ("Unknown host") — probably free, not confirmed via registrar. `padnav.js.org` returned HTTP 200 but with the generic js.org catch-all page content ("302 padnav - JS.ORG"), consistent with an unregistered subdomain rather than a real published page — treated as probably free but not verified against the official js.org repository.

**Verdict: free.**

### standarpad

Proposed attribute prefix: `spad`.

| # | Command | Output excerpt |
|---|---------|-----------------|
| 1 | `Invoke-WebRequest -Uri "https://registry.npmjs.org/standarpad"` | `STATUS:404` |
| 2 | `Invoke-WebRequest -Uri "https://registry.npmjs.org/%40standarx%2Fstandarpad"` | `STATUS:404` |
| 3 | Loop over variants `standar-pad`, `standarx-pad` | `standar-pad STATUS:404` / `standarx-pad STATUS:404` |
| 4 | `gh api repos/StandarX-miralabs-tech/standarpad` | `{"message":"Not Found","documentation_url":"https://docs.github.com/rest/repos/repos#get-a-repository","status":"404"}` — `gh: Not Found (HTTP 404)` |
| 5 | `gh search repos "standarpad" --match name --limit 15 --json fullName,stargazersCount,description,url --sort stars` | `[]` |
| 6 | `Invoke-WebRequest -Uri "https://standarpad.js.org"` | `STATUS:200` but content is the js.org catch-all page "302 standarpad - JS.ORG" (unregistered subdomain, standard error page for the service) |
| 7 | `Invoke-WebRequest -Uri "https://standarpad.dev"` | Unknown host. (standarpad.dev:443) — domain not resolved, so presumed free (not verified via registrar) |

Domain note: `standarpad.dev` returned NXDOMAIN (appears free, not confirmed via an official registrar/WHOIS lookup). `standarpad.js.org` is an unregistered subdomain (catch-all page at HTTP 200), so treated as free.

Web collision on record (low severity): the Go package `go-ph0n3` (`umarquez/go-ph0n3`) contains an internal struct/mapping named `StandarPad` for telephone DTMF keys — an internal code identifier, not an independent product or brand.

**Verdict: free.**

## All 48 candidates

Sorted free first, then risky, then taken; alphabetical within each group. "npm scoped" refers to `@standarx/<name>`; "org repo" refers to a repository of that name inside `StandarX-miralabs-tech`.

| Name | Prefix | Verdict | npm unscoped | npm scoped | Org repo | Notable collision |
|------|--------|---------|--------------|------------|----------|--------------------|
| dirfocus | dfoc | free | free | free | free | X account @DirFocus, no identified product link |
| dirko | dirk | free | free | free | free | GitHub user dirko (ML researcher, repos up to 36 stars) |
| divano | dvn | free | free | free | free | App Store app DIVANO, a card/pass manager |
| focato | foc | free | free | free | free | Dutch traffic-engineering software Focato (Trenso), different industry |
| focon | foc | free | free | free | free | FOCON Electronic Systems (rail signage brand, ~25 years), different industry |
| focuspad | fpad | free | free | free | free | App FocusPad, a focus/distraction blocker (getfocuspad.com) |
| glisso | gls | free | free | free | free | Glisso.net, active brass-instrument practice app with paid subscriptions |
| gridal | grdl | free | free | free | free | Legacy 1980s NCAR Graphics routine GRIDAL, unrelated domain |
| gridok | gdok | free | free | free | free | GitHub repo GridokuSupport (1 star), a Gridoku game support portal |
| joyko | joy | free | free | free | free | Joyko Stationery, an established Indonesian office-supply brand |
| kanapo | kpo | free | free | free | free | none |
| kiosko | kio | free | free | free | free | generic Spanish word for "kiosk"; no software brand found |
| kontro | ktr | free | free | free | free | Inventory-management app Kontro, popular in Brazil |
| manetto | mnt | free | free | free | free | Manetu, a consent-management platform (similar spelling) |
| movata | mova | free | free | free | free | Movata, a Discord movie-night bot (top.gg) |
| padly | padl | free | free | free | free | Padly, a padel-matchmaking mobile app (Google Play / App Store) |
| padnav | pnav | free | free | free | free | GitHub repo PadNav, 0 stars (Windows 11 gamepad browser-nav app) |
| padrix | pdrx | free | free | free | free | PadriX Global, a biochar/renewable-energy company, different industry |
| standaraim | saim | free | free | free | free | none |
| standarfocus | sfoc | free | free | free | free | none |
| standargrid | grid | free | free | free | free | none |
| standarkey | skey | free | free | free | free | none |
| standarlean | lean | free | free | free | free | none |
| standarnav | snav | free | free | free | free | none |
| standarpad | spad | free | free | free | free | Go package go-ph0n3, internal "StandarPad" DTMF map (code-only) |
| standarstick | stik | free | free | free | free | none |
| standartv | stv | free | free | free | free | unrelated npm package "standart" (abandoned linter, no "v") |
| standarwarp | warp | free | free | free | free | none |
| wayfocus | wfoc | free | free | free | free | none |
| arrowfocus | afoc | risky | free | free | free | npm package "arrow-focus" exists; npm blocks names differing only by punctuation |
| azimut | azm | risky | free | free | free | Azimutt (azimutt.app), popular open-source DB tool, 2181 GitHub stars |
| fairlead | fld | risky | free | free | free | fairlead.dev, active commercial dev product with 7 official SDKs |
| focusgrid | fgrid | risky | free | free | free | FocusGrid, an Eisenhower-matrix PWA task manager (focusgrid.org / .io) |
| padeo | pad | risky | free | free | free | Padeo (getpadeo.com), a JS predictive-preloading plugin with public docs/SDK |
| remio | remi | risky | free | free | free | remio.ai, an active AI personal-knowledge-management product |
| stikon | stik | risky | free | free | free | STIKON (stikon.co.uk), a UK security-products brand |
| zappo | zap | risky | free | free | free | Zappos, major US retail trademark (Amazon), one letter apart |
| binnacle | binn | taken | taken | free | free | Published npm package "binnacle" (Binnacle.io logging client) |
| gnomon | gno | taken | taken | free | free | PayPal npm package "gnomon" (932 GitHub stars, CLI logging tool) |
| gridnav | gnav | taken | taken | free | free | gridnav.js (codepo8), keyboard grid-navigation accessibility library |
| helm | helm | taken | taken | free | free | Helm (helm.sh), the official Kubernetes package manager, CNCF project |
| keynav | knav | taken | taken | free | free | npm package "keynav" (ggergo/keynav), focus/tab navigation via key combos |
| lodestar | lode | taken | taken | free | free | ChainSafe Lodestar, established Ethereum consensus client, 1421+ stars |
| rudder | rud | taken | taken | free | free | RudderStack, well-known open-source CDP, 4486-star flagship repo |
| tiller | till | taken | taken | free | free | Tiller Money, an established personal-finance product ($79/yr) |
| veer | veer | taken | taken | free | free | VeeR VR, an established VR content platform (since 2016) |
| wsn | wsn | taken | taken | free | free | Existing npm package "wsn" (Vue.js scaffolding CLI, published 2021-2022) |
| yaw | yaw | taken | taken | free | free | Yaw Labs, an npm-published dev-tooling brand (@yawlabs/mcp, @yawlabs/session) |

## Judge panel

Three judges independently scored the shortlisted candidates out of 10 on: **product** (clarity and memorability), **devex** (developer ergonomics of the name and its attribute prefix), and **risk** (collision/trademark exposure). Below are the scores of the top 10 candidates of the overall ranking (sum of the three scores, out of 30), for each judge, followed by the combined ranking table.

### Product judge

| Rank | Name | Score /10 |
|------|------|-----------|
| 1 | standarnav | 7.5 |
| 2 | padnav | 7.5 |
| 3 | standarpad | 7 |
| 4 | focon | 7 |
| 5 | joyko | 6.5 |
| 6 | standarstick | 5.5 |
| 7 | standarfocus | 6.5 |
| 8 | standarkey | 5 |
| 9 | standarwarp | 5 |
| 10 | dirko | 5.5 |

### Developer-ergonomics judge

| Rank | Name | Score /10 |
|------|------|-----------|
| 1 | standarnav | 6 |
| 2 | padnav | 7.5 |
| 3 | standarpad | 5.5 |
| 4 | focon | 7.5 |
| 5 | joyko | 8 |
| 6 | standarstick | 4 |
| 7 | standarfocus | 4 |
| 8 | standarkey | 4.5 |
| 9 | standarwarp | 5.5 |
| 10 | dirko | 6.5 |

### Collision-risk judge

| Rank | Name | Score /10 |
|------|------|-----------|
| 1 | standarnav | 9.5 |
| 2 | padnav | 7.5 |
| 3 | standarpad | 8.8 |
| 4 | focon | 4.5 |
| 5 | joyko | 4.5 |
| 6 | standarstick | 9.2 |
| 7 | standarfocus | 8 |
| 8 | standarkey | 9 |
| 9 | standarwarp | 8 |
| 10 | dirko | 6.5 |

### Overall ranking (top 10, sum out of 30)

| Rank | Name | Product | DevEx | Risk | Total /30 |
|------|------|---------|-------|------|-----------|
| 1 | standarnav | 7.5 | 6 | 9.5 | 23 |
| 2 | padnav | 7.5 | 7.5 | 7.5 | 22.5 |
| 3 | standarpad | 7 | 5.5 | 8.8 | 21.3 |
| 4 | focon | 7 | 7.5 | 4.5 | 19 |
| 5 | joyko | 6.5 | 8 | 4.5 | 19 |
| 6 | standarstick | 5.5 | 4 | 9.2 | 18.7 |
| 7 | standarfocus | 6.5 | 4 | 8 | 18.5 |
| 8 | standarkey | 5 | 4.5 | 9 | 18.5 |
| 9 | standarwarp | 5 | 5.5 | 8 | 18.5 |
| 10 | dirko | 5.5 | 6.5 | 6.5 | 18.5 |

### Judge notes summary

**Product judge.** The shortlist is not rejected outright: `padnav`, `focuspad`, and `standarnav` all hold up under a product/memorability lens, with `focon` as a debatable outsider — the only name with an obvious logo hook (the "faucon"/falcon), though it says nothing about the library's function. The candidates split into two families that each fail on an opposite axis: literal compounds (`padnav`, `focuspad`, `arrowfocus`, `dirfocus`, `focusgrid`) read clearly in one pass but sound descriptive rather than brand-like, while invented words (`focon`, `movata`, `gridal`, `kanapo`, `manetto`, `stikon`, `divano`, `glisso`) are memorable but tell a developer scanning npm nothing about what the library does. The `standar*` block is the safest choice for family consistency with `standardoc`/`standarflow`/`standarlua`/`standarcli`, but the members are largely interchangeable with each other, so it only makes sense if the library should signal "StandarX" first rather than stand alone as an independent open-source project. Several names should be dropped regardless of their "free" npm verdict because memorability actively works against them: `azimut` (near-homonym of the 2181-star tool Azimutt), `fairlead` (an active developer product with seven SDKs), `remio` (two active homonymous products), `focusgrid` and `padeo` (exact names already used by real software), and `standaraim`/`standarlean` (the French pronunciation ambiguity the naming constraints excluded), plus `standartv` (reads as a misspelling of "standard").

**Developer-ergonomics judge.** This judge keeps at least three strong picks (`joyko`, `focon`, `padnav`, with `focuspad` and `zappo` close behind) whose HTML attributes and imports read cleanly day to day, but rejects two entire sub-families. First, the **`standar*` family**: dropping the "d" from "standard" creates a structural typo trap — every English-speaking developer will reach for "standard" on every import line — and the derived prefixes (`sfoc`, `saim`, `skey`, `stik`) are either mute or misspelled; only `standarnav` (`snav`) and `standarwarp` (`warp`) hold up ergonomically, while `standargrid` is disqualified outright by its collision with `data-grid-*`. Second, every prefix with no vowel or that cannot be deduced from the name (`grdl`, `gdok`, `pdrx`, `dvn`, `ktr`, `mnt`, `kpo`, `fld`, `azm`, `gls`, `dfoc`, `wfoc`, `afoc`), since an attribute that cannot be pronounced in code review or recalled from memory forces a constant round trip to the documentation. Scoring weighs, in order: the readability of `data-<prefix>-up/-wrap/-container` in real HTML, the uniqueness of the `data-<prefix>-` string under grep, prefix length (3-4 characters), pronounceability, and freedom from typo traps in the imported name. It also flags that bare "foc" (`focon`, `focato`) greps noisily against `focus`/`focusable`, and notes its scoring is based purely on the ergonomics of the supplied data, without re-running any verification of its own.

**Collision-risk judge.** This judge finds the shortlist contains a genuinely sound core: the **`standar*` family** (`standarnav`, `standarstick`, `standarkey`, `standaraim`, `standarpad`, `standarlean`) has the best collision/legal profile in the batch — tokens absent from the web, both unscoped and scoped npm free, no GitHub repository, no third-party trademark — while also benefiting from brand-family consistency (`standardoc`/`standarflow`/`standarlua`/`standarcli`) that reduces rather than increases trademark exposure. This is the explicit basis for the risk judge's preference for the `standar*` family: `standarnav` tops its own ranking, `standarstick` is second, and the invented word `kanapo` is third. It firmly rejects `focusgrid`, `fairlead`, `remio`, `padeo`, `azimut`, and `arrowfocus` as active established software products or near-homonyms in the same space (`arrowfocus` is additionally likely blocked outright by npm's punctuation-similarity rule against the existing `arrow-focus` package), plus `divano`, `kiosko`, `kontro`, `zappo`, `focato`, `focuspad`, `glisso`, and `focon` for either dictionary-word googleability problems or an existing trademark/product under the exact name. It flags three methodology caveats applying to every candidate: no formal trademark search (INPI, EUIPO, USPTO) was performed for any name; an HTTP 200 on `*.js.org` is not by itself a sign of occupancy, since several checks showed an identical catch-all "302 <name> - JS.ORG" page for a random, unregistered subdomain — only names with clearly identified, distinct page content (`focon`, `divano`, `kiosko`, `remio`, `padeo`, `zappo`, `azimut`) were treated as actually occupied; and `.dev` status rests on DNS resolution failure alone ("probably free"), not on a registrar WHOIS lookup.

## Known risks and follow-ups

- A third-party GitHub organisation named `standarx` already exists, created 2024-12-24 in Brazil, with one repository (`.github`) and 2 followers; its website, standarx.com, was live on 2026-09-18. This organisation predates `StandarX-miralabs-tech` (created 2026-09-18) and is unrelated to it — a naming and brand-confusion risk that sits outside the npm/GitHub-org checks run above.
- No trademark search (INPI, EUIPO, USPTO) was performed for any candidate in this run.
- An HTTP 200 response on a `<name>.js.org` probe is inconclusive by itself: js.org serves an identical catch-all status page for many unregistered subdomains, and only a small number of candidates in this run were confirmed to have genuine, distinct published content.
- `.dev` domain checks were DNS-resolution probes only, not registrar WHOIS lookups; a DNS failure indicates a domain is "probably free" but is not a registration-authority confirmation.

## Additional candidates probed after the panel

Six further candidates were probed after the judge panel concluded. All were free on npm unscoped, free under the `@standarx` scope, and free in the `StandarX-miralabs-tech` organisation on 2026-09-18:

- **navpad** — only 0-star GitHub repositories found under this name.
- **focusnav** — no collision found.
- **navfocus** — no collision found.
- **dpadnav** — no collision found.
- **padfocus** — no GitHub repository of that name found.
- **snav** — collision: `imsyy/SNav`, 441 GitHub stars.
