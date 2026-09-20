# ADR-0014: Device and browser test matrix

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

One rider inside this ADR is Proposed and still needs the owner's confirmation: which devices in the
acquisition list are bought and which are borrowed, and by when.

## Context

standarnav is a navigation engine for d-pads, television remotes, gamepad sticks and arrow keys.
Its audience is televisions, consoles and handhelds. Not one of those was ever used to run the
code: the source repository states it plainly, listing TV and consoles (webOS, Tizen) as out of
scope, the stated reason being no hardware and no emulator (miralabs-ui `ROADMAP.md:112`, read
2026-09-18; that file is written in French and the row is quoted verbatim in the Evidence section).

That gap is normal for a young library. What is not acceptable is publishing it as if it did not
exist. A reader looking at any support table in this space has no way to tell which rows came from
a device and which came from a vendor's specification page. This ADR decides how standarnav answers
that question about itself, and what it takes before a row in its support table is allowed to
change.

The browser layer is a separate problem from the device layer, and conflating them is the mistake
this ADR exists to prevent. A browser engine can be tested in CI. A device cannot: a television
adds a firmware build, a remote with its own key codes, a memory ceiling, a compositor, and an
input stack that none of the three CI engines reproduce. Passing on Chromium in CI says the code
runs on Chromium. It says nothing about a Tizen set that happens to embed Chromium.

## Decision

**1. CI runs the browser suite on three engines.** The browser project runs on `chromium`,
`firefox` and `webkit` through `@vitest/browser-playwright`, one engine per job in a
`fail-fast: false` matrix. This is wired in this repository, read 2026-09-18: `vitest.config.ts:9`
reads the engine from `SNAV_BROWSER` and defaults to `chromium`, `vitest.config.ts:23-36` declares
the browser project with the Playwright provider and `headless: true`, and
`.github/workflows/ci.yml:61-83` fans the job out over `matrix.browser: [chromium, firefox, webkit]`
with `fail-fast: false` (`:63-66`). The dependencies are pinned at `package.json:77`
(`@vitest/browser-playwright` `^5.0.1`) and `package.json:79` (`playwright` `^1.63.0`), with the
`test:browser` script at `package.json:48`.

These engines are the versions the pinned Playwright release ships, which are current engines. They
do **not** exercise the floor set by [ADR-0013](0013-browser-baseline-and-fallbacks.md), and they do
not exercise a single fallback path, because they have every modern API the fallbacks exist for.

**2. No support claim for a device without a dated device report.** A device row moves out of
"designed for" only when someone files a report through the `device_report` issue template
(`.github/ISSUE_TEMPLATE/device_report.yml` in this repository, present 2026-09-18) and it is linked
from the matrix. The report carries: device model, firmware version, the engine version
the device reports at runtime, the date, the standarnav version, which scenarios were exercised, and
what failed. A vendor specification page is not a device report. Neither is a passing CI job.

**3. The matrix is published in three explicit columns.**

| Column | Meaning |
|---|---|
| Designed for | The code accounts for this target: key codes are in the keymap, the engine version is at or above the baseline, the behaviour is intended. Nobody has run it. |
| Verified in emulator | A vendor emulator or simulator ran the browser suite, with a date. The emulator's engine version is only claimed to match the firmware when the vendor documents that it does. |
| Verified on device | A dated device report exists and is linked. |

As of 2026-09-18, **every device row is "designed for" and nothing else**. The other two columns are
empty across the whole table. The matrix is published with the columns empty rather than omitted:
an empty column is information.

**4. Hardware to acquire or borrow before the first support claim.**

| Target | Why it is needed |
|---|---|
| One Tizen television, 2022 model year or later | Tizen 6.5 embeds Chromium 85 (Samsung engine table, fetched 2026-09-18); exercises the Tizen remote codes Return 10009 and Exit 10182 (miralabs-ui `keymap.ts:81-82`) |
| One webOS television, 2022 model year or later | webOS 22 embeds Chromium 87 (LG engine table, fetched 2026-09-18); exercises the webOS Back code 461 (miralabs-ui `keymap.ts:80`) |
| One Xbox-layout pad | The `mapping: "standard"` reference: A select, B back, LB/RB tabPrev/tabNext, LT pageUp (miralabs-ui `packages/core/src/input/gamepad/mapping.ts:19-25`, read 2026-09-18) |
| One DualSense | Pad type detection and the button-glyph question |
| One Switch Pro controller | The reason `swapNintendoConfirm` exists; it is off by default (miralabs-ui `packages/core/src/input/gamepad/gamepad.ts:127`, `options.swapNintendoConfirm === true`, read 2026-09-18) and has never been exercised against real hardware |
| One Steam Deck | Handheld with a built-in pad inside a CEF browser; the Steam client CEF was documented at Chromium 109 in early 2024 and no source was re-verified on 2026-09-18 |

Which of these are bought and which are borrowed, and on what date, is the Proposed rider above.

**5. Emulators are used, and reported as emulators.** The Tizen Studio TV emulator and the webOS TV
simulator are the targets to run the suite on before any hardware arrives. Neither has been run as
of 2026-09-18. Their results land in the "verified in emulator" column only, and never in the
"verified on device" one. Their engine version is stated to equal the target firmware's engine **only**
when the vendor documents that equality; otherwise the entry reads "engine version unverified". A
simulator that runs on the host's own browser engine is not evidence about a television.

## Consequences

- The README and `docs/` carry the same matrix, written once and copied from a single place so the
  two cannot drift. A device claim that appears in the README and not in the matrix is a bug.
- Keymap entries for Vidaa, Vizio, Roku, Fire TV and Android TV are **not** added speculatively. The
  default table today covers webOS and Tizen only (miralabs-ui `packages/core/src/input/keymap.ts:80-84`,
  read 2026-09-18: webOS Back 461, Tizen Return 10009, Tizen Exit 10182, channel up/down 427/428 →
  `pageUp`/`pageDown`, source `"remote"`). Codes for the other platforms are added when a device
  report supplies them, with the report linked from the commit. Guessing a remote's key codes from a
  forum post produces a table nobody can trust and nobody can correct.
- Until the first device report exists, the project's public answer to "does it work on my TV?" is:
  designed for it, never run on it. That sentence goes in the README verbatim rather than being
  softened.
- The fallback branches required by [ADR-0013](0013-browser-baseline-and-fallbacks.md) need unit
  tests that hide the modern API, because no engine in the CI matrix will ever take those branches.
- A CI matrix of three current engines is cheap and catches real divergence — focus order, computed
  direction, `checkVisibility` semantics — which is why it stays even though it proves nothing about
  the baseline floor.
- Gamepad behaviour is the least CI-testable part of the library: the source exposes a
  `GamepadRuntime` seam (miralabs-ui `packages/core/src/input/gamepad/gamepad.ts:59`, used by
  `gamepad.browser.test.ts:43`, read 2026-09-18) so the polling loop can be driven by a fake, which
  tests the logic and not the hardware. Stick dead zones, hysteresis and repeat curves are judged on
  a real pad or not at all.

## Amendment, 2026-09-20: the matrix is unchanged, the evidence moved

Nothing in the decision changes. Every device row is still "designed for" and the other two
columns are still empty, because no emulator run and no device report exists. What changed is
where the facts this record cites now live, and the citations below are stale by line number even
where they are true by content.

The three-engine CI matrix of decision 1 runs and is green: `.github/workflows/ci.yml:94-120`,
`fail-fast: false` over `[chromium, firefox, webkit]`, `SNAV_BROWSER` set per entry, and
`bun run test:browser` reporting 169 passed and 1 skipped in 10 files on each (2026-09-20). The
matrix job moved down the file since this record was written: the lines it used to occupy now
hold `react-floor` (`:66-92`), which runs the same browser project on chromium alone against the
declared React peer floor. That is a fourth browser run, not a fourth engine, and it changes
nothing about this decision. The
`package.json` line numbers this record gives for `test:browser`, `@vitest/browser-playwright` and
`playwright` are from the 2026-09-18 file and no longer resolve; the current ones are `:66`, `:77`
and `:79`. `vitest.config.ts:9` and the browser project are still where this record says, modulo
the same drift — `:30-36` now.

The keymap is no longer only readable in miralabs-ui: `src/keymap.ts` is here, and the remote
codes decision 4 lists as what a Tizen or webOS set would exercise are in it. The `GamepadRuntime`
seam consequence is likewise local now — `src/gamepad/gamepad.ts`, driven by
`src/gamepad/gamepad.browser.test.ts` — and the sentence it supports is unchanged: that seam tests
the logic and not the hardware, and stick dead zones, hysteresis and repeat curves are judged on a
real pad or not at all.

Which is the point worth restating on the day this package is about to be published: 269 passing
tests are evidence about three desktop browser engines, and about nothing else.

## Alternatives considered

- **Claim support from vendor documentation alone.** Rejected. Samsung and LG publish the Chromium
  version their firmware embeds, and that is genuinely useful — it is the basis for the "designed
  for" column. It is not a statement that this library works there. Vendor engines are patched,
  memory-limited and paired with input stacks the specification page does not describe.
- **Publish a single "supported platforms" list with no columns.** Rejected. It forces one word to
  carry three very different confidence levels, and readers reasonably assume the strongest one.
- **Wait for hardware before publishing any matrix.** Rejected. The matrix with two empty columns is
  more useful to a reader today than no matrix, and it creates the place where the first device
  report will land.
- **Rely on a paid device farm.** Not decided. Whether any farm offers Tizen or webOS television
  browsers, and at what price, was not investigated on 2026-09-18 — to be verified. If one does, its
  results belong in the "verified on device" column under the same report rules.
- **Emulator results in the same column as device results.** Rejected. The emulator is the only
  target available today, which is exactly why merging the columns would be tempting and wrong.

## Evidence

- miralabs-ui `ROADMAP.md:112`, a row of the out-of-scope table (read 2026-09-18). That file is written in French; the row translates as "TV and consoles, webOS and Tizen: no hardware and no emulator".
- `package.json:48` (`"test:browser": "vitest run --project browser"`), `:58` (`@vitest/browser-playwright` `^5.0.1`), `:60` (`playwright` `^1.63.0`) in this repository, read 2026-09-18.
- `vitest.config.ts:9` (`SNAV_BROWSER`, default `chromium`), `:23-36` (browser project, Playwright provider, `headless: true`) in this repository, read 2026-09-18.
- `.github/workflows/ci.yml:61-83` (browser job), `:63-66` (`fail-fast: false`, matrix `browser: [chromium, firefox, webkit]`), `:81-83` (`bun run test:browser` with `SNAV_BROWSER`) in this repository, read 2026-09-18.
- `.github/ISSUE_TEMPLATE/device_report.yml` present in this repository, 2026-09-18.
- Keymap contents: miralabs-ui `packages/core/src/input/keymap.ts:80-84`, read 2026-09-18 — webOS and Tizen codes only, no Vidaa, Vizio, Roku, Fire TV or Android TV entries.
- Television engine versions, fetched 2026-09-18: https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html · https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
- Steam Deck: the Steam client's embedded Chromium (CEF) was 109.0.5414.120 in the beta client of 2024-01-18 (https://steamdeckhq.com/news/steam-deck-beta-client-1-18-24-descriptions/, fetched 2026-09-18); no newer version is disclosed as of 2026-09-18, Valve having confirmed a November 2025 rebuild (Alloy to Chrome runtime) without a version number (https://steamcommunity.com/groups/SteamClientBeta/discussions/3/688615792191756981/, fetched 2026-09-18).
- Baseline tiers and fallback rules: [ADR-0013](0013-browser-baseline-and-fallbacks.md). Extraction scope: [ADR-0003](0003-package-boundaries.md).
