# ADR-0002: License and copyright holder

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

## Context

standarnav is extracted from miralabs-ui (see
[ADR-0003](0003-extraction-scope.md)). Two questions had to be answered before
the first public commit: under which license the new repository ships, and
whose name appears in the copyright line.

Three facts framed the answer.

**The source is MIT.** An earlier brief assumed miralabs-ui was under FSL
(Functional Source License). That was wrong. miralabs-ui has been MIT since its
initial commit — the `LICENSE` file, seven `package.json` files and the README
all agree. The assumption was corrected on 2026-09-18 by reading those files in
miralabs-ui at commit `289fa607`. Nothing in the source
therefore constrains the new repository to a non-open-source license, and
relicensing the extracted code is not a question that arises.

**The copyright line in the source names an organisation.** miralabs-ui carries
`Copyright (c) 2026 MiraLabs` (its `LICENSE` line 3, commit `289fa607`, read
2026-09-18). standarnav is a personal project of its author,
published under a personal GitHub org; naming an entity that does not hold the
work would be inaccurate.

**The engine borrows published design ideas, not code.** Three reference
implementations shaped the geometry and the container behaviour:

| Idea borrowed | From | Where it lives |
|---|---|---|
| Asymmetric orthogonal weights, 30 for horizontal moves and 2 for vertical | Blink, `kOrthogonalWeightForLeftRight` / `kOrthogonalWeightForUpDown` in `third_party/blink/renderer/core/page/spatial_navigation.cc` | `DEFAULT_WEIGHT_HORIZONTAL` / `DEFAULT_WEIGHT_VERTICAL`, `src/spatial/geometry.ts:41-42` |
| 30 % directional overlap tolerance, and per-container memory of the last focused child | BBC `lrud-spatial` (overlap threshold; `data-focus` memory attribute) | `DEFAULT_OVERLAP_THRESHOLD = 0.3`, `src/spatial/geometry.ts:40`; entry strategy `last` in `src/spatial/containers.ts` |
| Alignment-first candidate selection ("two passes"), explicit redirections in the spirit of `UIFocusGuide`, application veto in the spirit of `shouldUpdateFocusInContext` | Apple tvOS Focus Engine (public documentation and write-ups) | `findBestCandidate` in `src/spatial/geometry.ts:139-185` (one loop, two accumulators, `aligned ?? any`), `data-snav-up/down/left/right`, `onWillMove` |

The "where it lives" column was rewritten on 2026-09-20 to point at this repository's own files,
which now hold the code; the source equivalents are at miralabs-ui
`packages/core/src/input/spatial/geometry.ts:41-43` and `:140-186`. Nothing in the arithmetic
changed in the move — see [ADR-0016](0016-scoring-constants-provenance.md).

None of these is copied source. The constants are published numbers and the
behaviours are described patterns; the scoring formula itself is not Blink's
(see [ADR-0016](0016-scoring-constants-provenance.md)). MIT imposes no
`NOTICE` obligation, and no third-party license text needs to be redistributed.
Attribution is still owed as a matter of honesty, not of law.

## Decision

standarnav is released under the **MIT License**, with
**`Copyright (c) 2026 Wesley Cormier`**.

The license text is in `LICENSE` at the repository root: the standard MIT text,
copyright line `Copyright (c) 2026 Wesley Cormier`.

Provenance of borrowed design ideas is recorded in two places, not in the
license file:

1. [ADR-0016](0016-scoring-constants-provenance.md), which lists each borrowed idea,
   its origin, and what was changed.
2. Code comments at the point of use, where the origin explains a non-obvious
   WHY — the source does this in
   `packages/core/src/input/spatial/geometry.ts`: `:6-7` cites the `lrud` to
   `lrud-spatial` lesson, `:10` and `:198` cite tvOS (miralabs-ui, read
   2026-09-18).

   **Amended 2026-09-20: the extracted file cites the record, not the origins.**
   `src/spatial/geometry.ts` names no borrowed project. Its header explains the
   two passes and the asymmetric penalty and then defers — "Every constant here
   has its provenance in ADR-0016" (`:16`); `grep -rni "tvos\|lrud\|blink"
   src/spatial/` returns nothing (2026-09-20). That is a deliberate narrowing
   rather than a loss: one place holds the attribution, it is the place this
   decision already names as authoritative, and a citation cannot drift out of
   step with the record when it *is* the record. Point 1 above therefore carries
   the whole of the attribution obligation, which makes keeping
   [ADR-0016](0016-scoring-constants-provenance.md) accurate an honesty
   requirement and not just a tidiness one.

Contributions are accepted under **inbound=outbound**: submitting a
contribution licenses it to the project under the same MIT terms, with no
separate agreement. This is stated in `CONTRIBUTING.md`, section "Licensing of
contributions". There is no CLA and no DCO sign-off requirement.

## Consequences

- Consumers may use, modify, embed and relicense the code, including in
  proprietary products, provided the copyright notice and the license text
  travel with substantial portions of the software.
- miralabs-ui, itself MIT, can depend on `@standarx/nav` with no license
  friction in either direction ([ADR-0003](0003-extraction-scope.md)).
- MIT is the most common license in this ecosystem, not a universal one. Of the
  twenty competitor fact sheets built on 2026-09-18 (license column of
  [docs/research/competitors.md](../research/competitors.md)), ten declare MIT
  at least on npm — among them Norigin, Tabster, the WICG polyfill,
  `@please/lrud`, `react-sunbeam`, `react-js-spatial-navigation`,
  `@arrow-navigation/core` and `react-tv-space-navigation`. Four declare
  Apache-2.0, including the BBC and LG projects (`lrud`,
  `@bbc/tv-lrud-spatial`, Enact Spotlight, `@gauntface/dpad-nav`). Three
  declare MPL-2.0, one diverges between GitHub and npm, and two declare none. A
  license a consumer already accepts elsewhere removes one adoption question.
- No patent grant is given and none is received. MIT's grant is implicit at
  best; a contributor holding a patent over a contributed technique grants
  nothing explicit. Accepted as a low risk for a DOM focus library.
- Changing the license later requires the agreement of every copyright holder
  who has contributed by then. As long as the author is the sole contributor,
  the cost is zero; each accepted pull request raises it.
- The copyright year stays `2026` — the year of first publication — rather than
  being rolled forward annually. No process is needed to maintain it.
- Every future source file that carries an SPDX header uses
  `SPDX-License-Identifier: MIT`. No per-file copyright header is required.

## Alternatives considered

| Option | Why not |
|---|---|
| **Apache-2.0** | Its explicit patent grant and patent-retaliation clause are a real advantage for a library that might one day be adopted by device manufacturers, and the BBC and LG projects in this space use it. Rejected for v0: the license text is long, it adds a `NOTICE` file convention and a "state your changes" obligation, and it is a worse match for the source (MIT) and for the direct consumer miralabs-ui (MIT). Reconsider if a corporate adopter asks for it — relicensing MIT code to Apache-2.0 is permitted while the author is the sole holder. |
| **FSL (Functional Source License)** | Rejected on principle: FSL is not an open-source license. Under its published terms (<https://fsl.software/>) it restricts competing use for two years, after which each release converts to MIT or Apache-2.0 depending on the variant chosen. The project is published as open source, and the earlier assumption that miralabs-ui was FSL was itself factually wrong (see Context). |
| **Keep `MiraLabs` as the copyright holder** | Rejected: standarnav is not a MiraLabs work product, it lives under a different GitHub org, and it is maintained personally. Naming an organisation that does not hold the work weakens the notice rather than strengthening it. The owner explicitly chose to use a real personal name. |
| **Dual MIT/Apache-2.0 (the Rust convention)** | Rejected as unnecessary complexity for a single-package project with no known patent exposure. It would double the license files and the header conventions for a benefit nobody has asked for. |
| **Add a `NOTICE` file for the borrowed design ideas** | Rejected: no borrowed license requires it, and a `NOTICE` file would suggest redistributed third-party code where there is none. Attribution belongs in [ADR-0016](0016-scoring-constants-provenance.md), which the code points at from the one comment that raises the question (`src/spatial/geometry.ts:16`), where it is read by the people it is meant to inform. |

## Evidence

- `LICENSE` at the repository root, read 2026-09-18: standard MIT text, line 3
  `Copyright (c) 2026 Wesley Cormier`.
- `CONTRIBUTING.md`, section "Licensing of contributions", read 2026-09-18:
  "This project is MIT licensed. Contributions are accepted under
  inbound=outbound ... with no separate agreement required."
- Source license, read in miralabs-ui at commit `289fa607` on 2026-09-18: its
  root `LICENSE` carries the MIT text, and the `license` field of its seven
  `package.json` files and its README agree. The earlier FSL assumption was
  wrong; it is recorded here so it is not repeated.
- The three evidence entries below were written against the source on 2026-09-18 and their line
  numbers are miralabs-ui's. The same constants now live at `src/spatial/geometry.ts:40-42` here
  (re-read 2026-09-20, values unchanged), and the two comments they cite did **not** travel: this
  repository's `geometry.ts` names no borrowed project and defers to
  [ADR-0016](0016-scoring-constants-provenance.md) instead, per the amendment in the Decision
  section above.
- Blink weights: miralabs-ui `packages/core/src/input/spatial/geometry.ts:42-43`
  (`DEFAULT_WEIGHT_HORIZONTAL = 30`, `DEFAULT_WEIGHT_VERTICAL = 2`), traced to
  `kOrthogonalWeightForLeftRight = 30` and `kOrthogonalWeightForUpDown = 2` in
  `third_party/blink/renderer/core/page/spatial_navigation.cc`. The scoring
  formula is not Blink's — see [ADR-0016](0016-scoring-constants-provenance.md),
  which reads the formula line by line.
- lrud-spatial: miralabs-ui `packages/core/src/input/spatial/geometry.ts:41`
  (`DEFAULT_OVERLAP_THRESHOLD = 0.3`) and the header comment at
  `geometry.ts:6-7` ("the lesson BBC learnt going from `lrud` to
  `lrud-spatial`"). Origin documented in miralabs-ui `docs/research/input.md:25`
  and `:255` — the engine specification of 2026-08-27, deleted by commit
  `289fa607` and readable with `git show 289fa607^:docs/research/input.md` —
  source <https://github.com/bbc/lrud-spatial> (30 % default overlap
  tolerance, `data-focus` container memory, `data-block-exit`).
- tvOS: miralabs-ui `packages/core/src/input/spatial/geometry.ts:10` and `:198` in the
  source comments; rationale in miralabs-ui `docs/research/input.md:27`
  (orthogonal-projection overlap bias, `UIFocusGuide` redirections,
  `shouldUpdateFocusInContext` veto), sources
  <https://developer.apple.com/documentation/uikit/uifocusguide> and
  the Airbnb Engineering write-up listed at `docs/research/input.md:257` of the
  same deleted file.
- Competitor licenses, 20 fact sheets verified by reading each project's own
  repository on 2026-09-18: license column of
  [docs/research/competitors.md](../research/competitors.md).

Related: [ADR-0001](0001-name-scope-and-attribute-prefix.md),
[ADR-0003](0003-extraction-scope.md),
[ADR-0016](0016-scoring-constants-provenance.md).
