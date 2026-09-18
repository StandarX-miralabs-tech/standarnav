# ADR-0017: Size budgets: measure before capping

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

This package targets televisions and set-top boxes. There, bytes are parse time
on a slow CPU over a slow link, so the size of each subpath is a product
constraint, not a vanity metric. The package is split into subpaths
(`@standarx/nav`, `/gamepad`, `/spatial`, `/focus-ring`, `/debug`, plus framework
adapters), which makes "how big is the package" ambiguous: a core-only consumer
pays nothing for the gamepad engine.

The source repository already enforces budgets and already hit the ambiguity: its
script measures each line with the shared layers marked external, because
otherwise every component line would be charged for the engine again and the 3 kB
line would mean nothing (miralabs-ui `scripts/size-budget.ts:1-12`).

The measurements inherited from that repository, `bun run check:size` run on
2026-09-18 against a dist built the same day, min+gzip at Bun's default gzip
level:

| Line | Measured | Cap | Externals declared for that line |
|---|---|---|---|
| input system (intents + engage) | 1.93 kB | 2.00 kB | `../dom/*`, `../utils/*`, `../interaction/*` |
| gamepad engine | 2.35 kB | 3.00 kB | `../*`, `../../*` |
| spatial engine | 2.81 kB | 3.00 kB | `../*`, `../../*` |
| modality tracker | 0.74 kB | 1.00 kB | none declared |

One further figure circulates and must be labelled: the spatial engine bundled
with **nothing** external was reported at 3 303 B, above 3 kB, on 2026-09-18, and
has **not** been re-measured here. It does not contradict the 2.81 kB line — it
is the other question, asked of the same module. Figures from the source
repository's 2026-08-27 release notes (2.48 kB gamepad, 2.89 kB spatial, 1.34 kB
focus ring) are historical and only ever quoted with that date attached.

The budget script now exists **here** too: `scripts/size-budget.ts`, wired as
`bun run check:size`. Nothing has been built or measured in this repository yet —
there is no `dist/`, no build has run, and `package.json` on 2026-09-18 exposes
only `./package.json` in its exports map — so every cap in that script is `null`
and the run fails by design.

## Decision

1. Measurement answers two questions, so the report carries two kinds of line.
   - A **marginal** line per opt-in subpath — gamepad engine, spatial engine,
     focus ring, debug — measured with its siblings external: what a consumer who
     already imports the core pays to add it.
   - One **whole-package** line, every runtime entry bundled with nothing
     external: what a consumer of everything pays. That line is what makes a
     figure of the 3 303 B kind official instead of anecdotal.
2. A cap is written **only after the first measurement in this repository**. An
   inherited number is context, never a ceiling: the bundler, the target and the
   file layout all change in the move.
3. Caps are the measured value rounded **up to the next quarter kB**. That is
   headroom for noise, not for growth.
4. A cap is raised only by amending this ADR, in its own commit. Never in the
   pull request that exceeded it. The pull request that exceeds a cap either gets
   smaller or gets an amendment first.
5. **A line without a cap fails the run.** The measurement is printed in the
   failure so the cap can be written from it. This rule is inherited from the
   source script, where `limit: null` means "measured, not yet ceilinged" and the
   run fails by design.
6. The script is **JavaScript only**. The source repository's script is 2006
   lines (`wc -l scripts/size-budget.ts` in miralabs-ui, run 2026-09-18) and
   roughly half of it compiles and measures SCSS with `sass-embedded` and
   `lightningcss`; this package ships no stylesheet, so that half was not copied.
   The script written here measures built JavaScript only.
7. Measurements are min+gzip at Bun's default gzip level. That reads a little
   heavier than `gzip -9`. One level is cited, never a mix.
8. Every size in a committed document carries its command and date (the
   repository's numbers rule) and says whether it was measured here or inherited.

## Consequences

- No cap can be written until the first build exists here, so rule 5 means
  `check:size` fails from now until the first measurement is recorded — and it
  fails earlier still, with a message telling the reader to run `bun run build`,
  while `dist/` is missing. The intended sequence: red, measure, cap, green.
- Bundling every subpath alone and then all of them together is more work per run
  and a longer report. Accepted: the single-number version lets a shared module
  quietly get expensive for everyone while every individual line stays green.
- The 1.93 kB of 2.00 kB inherited on the input system leaves almost no room. If
  the same shape reappears here, the first measurement gives a cap of 2.00 or
  2.25 kB and the next feature on that line needs an amendment. That is the
  mechanism working, not failing.
- Rule 4 makes some pull requests two commits instead of one. That is the price
  of a cap that means anything.
- The focus ring is a special case the budget alone does not capture: its visual
  defaults live in a stylesheet that stays in the source repository, so a small
  bundled size does not mean a complete feature. See
  [ADR-0003](0003-extraction-scope.md) for what is extracted.
- Budgets constrain the engine described in [ADR-0016](0016-scoring-constants-provenance.md);
  a change to the scoring rule is both a fixture question and a size question.

## Alternatives considered

**A bundlephobia badge in the README.** Rejected: it is not blocking, it lags
the published version, it cannot exist before publication, and it measures one
thing (the whole package) out of the several this package needs measured. A
badge also invites a number without the command that produced it, which the
repository's numbers rule forbids.

**A single total cap for the package.** One ceiling, everything bundled.
Rejected: it charges a core-only consumer for the gamepad engine they never
import, and hides a regression in one subpath behind slack in another. The source
repository refused the equivalent: its specification costed the two engines as a
single 4 kB line, and the line was **split** rather than raised when the pair
measured 5.16 kB (miralabs-ui `scripts/size-budget.ts`, above the gamepad entry).

**`size-limit` instead of a written script.** Rejected for the reason the source
repository rejected it: these budgets are "what does a consumer pay", not "how
big is this file", so `size-limit` would need a synthetic entry per line anyway.

**Inherit the source caps directly.** Rejected by rule 2. The caps would be
green or red for reasons belonging to another repository's build.

## Evidence

- Source measurements: `bun run check:size` in miralabs-ui on 2026-09-18, dist
  built the same day, min+gzip at Bun's default gzip level — input system 1.93 kB
  of 2.00 kB (96 %), gamepad 2.35 kB of 3.00 kB (78 %), spatial 2.81 kB of
  3.00 kB (94 %), modality tracker 0.74 kB of 1.00 kB (74 %). Recorded in
  [docs/journal/2026-09-18.md](../journal/2026-09-18.md), together with the
  3 303 B spatial-without-externals figure reported the same day, not re-measured.
- This repository's `scripts/size-budget.ts`, declared as `check:size`, read
  2026-09-18: six lines — `core` (`index.js`), `gamepad engine`, `spatial engine`
  and `focus ring` (each with `["../*", "../../*"]` external), `debug` (`["./*"]`
  external) and `whole package` (the four runtime entries re-exported through one
  synthetic module, nothing external, the debug entry excluded on purpose). Every
  `cap` is `null`: the run prints each measurement and exits non-zero, and a
  missing `dist/` exits first with a message pointing at `bun run build`.
- miralabs-ui `scripts/size-budget.ts`, read 2026-09-18: budget entries and their
  externals at `:572-597` (input system 573-577, gamepad 585-589, spatial
  592-596) and `:412-416` (modality tracker, no `external` field); `:44-52`, the
  doc comment on `Budget.limit` making `null` fail the run; `:11-12`, Bun's
  default gzip level and the instruction never to mix it with `gzip -9`;
  `:580-584`, the two engines costed as one 4 kB line, the pair measured 5.16 kB
  and the line split because importing one engine never pulls in the other;
  `:3-8`, why `size-limit` "would need a synthetic entry per line anyway".
  `wc -l` on that file → 2006, run 2026-09-18, `lightningcss` and `sass-embedded`
  imported at lines 17-18.
- Historical figures of 2026-08-27 (2.48 kB gamepad, 2.89 kB spatial, 1.34 kB
  focus ring): miralabs-ui release notes of that date, quoted in
  [docs/journal/2026-09-18.md](../journal/2026-09-18.md).
- Nothing built here yet: this repository's `package.json`, read 2026-09-18, has
  `"exports": { "./package.json": "./package.json" }`, and no `dist/` exists.
