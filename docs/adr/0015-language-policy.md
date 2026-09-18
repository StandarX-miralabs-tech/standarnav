# ADR-0015: Language policy

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

One rider inside this ADR is Proposed and still needs the owner's confirmation:
the CI mechanism enforcing rule 5 (see "Proposed mechanism" in the Decision
section).

## Context

The owner of this repository is French-speaking. The audience is not: spatial
navigation for televisions, gamepads and remotes is built by teams spread across
several countries, and the prior art this project sits next to is written in
English (BBC `lrud-spatial`, Microsoft Tabster, LG Enact Spotlight, the WICG
polyfill).

The source repository the engine is extracted from mixed both languages. Its
specification (`docs/cahier-des-charges.md`), its research note
(`docs/research/input.md`) and most of its commit messages are French; its code,
its identifiers and its code comments are English. Both documents were deleted
from that repository by commit `289fa607` on 2026-09-18 and are readable with
`git show 289fa607^:<path>`. That mix works for a single author and stops working
the moment an outside contributor opens an issue: a French specification
paragraph is a wall for a reader who can read the code underneath it perfectly
well.

The extraction (see [ADR-0003](0003-extraction-scope.md)) is the moment to fix
this, because it is the moment the repository becomes public and every file gets
rewritten anyway. Deciding afterwards would mean a translation pass over a
growing corpus.

Two needs pull in opposite directions. Contributors and readers need one
language they can all read. The owner thinks and drafts faster in French, and
throwing that away would slow down the design work that produces the documents
in the first place.

## Decision

1. Every committed Markdown file is English. That includes the README, the
   CHANGELOG, every ADR, the journal, the specification, issue and pull-request
   templates, and the contributor guide.
2. Code is English: identifiers, public API names, type names, error messages,
   test titles.
3. Comments are English, and there are no comments by default. A comment is
   written only for a non-obvious *why* — a constant with an external origin, a
   workaround for a runtime bug, an invariant a reader cannot derive from the
   code. Restating what the next line does is not a reason.
4. Commit messages are English and follow conventional commits. No AI
   co-author trailer, ever.
5. User-facing documentation, when it exists, is `docs/en` canonical with a
   strict file-by-file `docs/fr` mirror. A page whose mirror is missing or stale
   does not merge. **Proposed mechanism:** each `docs/fr/<page>.md` carries in
   its front matter the git blob hash of the English source it was translated
   from; a CI job recomputes the hash of `docs/en/<page>.md` and fails the run on
   mismatch or on a missing counterpart. This is a proposal, not a built gate:
   `docs/en` and `docs/fr` do not exist yet, and the owner has to confirm the
   mechanism before it is implemented.
6. Internal French working notes are never committed. Drafts, research scratch,
   session briefs and anything the owner writes to think with stay untracked and
   outside the published tree.
7. There is no second canonical language. `docs/fr` is a mirror; when the two
   disagree, `docs/en` is right.

## Consequences

- A French draft in the owner's untracked notes is translated before it becomes a
  committed document. That is a real cost, paid by the owner, on every design note
  that graduates into an ADR or a specification section.
- The ADR corpus stays readable by a contributor who has never read a word of
  French, which is the point.
- Rule 5 is a merge blocker once `docs/fr` exists. It is also a trap: it makes
  adding a French page cheap and adding an English page expensive, because the
  English page now owes a translation. The trap is deliberate — a half-translated
  documentation set is worse than an English-only one, because it teaches readers
  to distrust the French pages.
- Until the gate exists, rule 5 is enforced by review only. Nothing today
  prevents a `docs/fr` page from drifting.
- The rule "no comments by default" interacts with [ADR-0016](0016-scoring-constants-provenance.md):
  the scoring constants are exactly the case rule 3 keeps comments for, because
  their origin is external and cannot be read off the arithmetic.
- Issues and discussions opened in French get answered in English, which may read
  as unfriendly to a French contributor. Accepted: the alternative is a thread no
  one else can follow.

## Alternatives considered

**Bilingual ADRs with an English summary.** Every ADR written in French with an
English abstract at the top. Rejected by the owner on 2026-09-18: it doubles the
maintenance of every decision record, and the abstract inevitably drifts from the
body it summarises. The reader who most needs the document is the one who only
gets the abstract.

**French canonical, English mirror.** The inverse of rule 5. Rejected: the code
is already English (source repository, verified 2026-09-18), so a French
canonical layer would sit on top of an English artefact and every API name in
every paragraph would be a foreign word. It also makes external contribution
strictly harder for no gain the owner needs.

**No policy — write whatever fits.** This is what the source repository did.
Rejected: it produced a specification the owner can read and a contributor
cannot, and there is no point at which such a corpus gets cheaper to fix.

**English only, no French at all, including private notes.** Rejected: it would
tax the owner's own drafting for no external benefit, since those notes are
untracked and no reader ever sees them.

## Evidence

- The owner's decision of 2026-09-18, recorded in this ADR: every committed
  Markdown file is English, code and comments are English, and French working
  notes stay untracked.
- Source repository mixing both languages: miralabs-ui
  `docs/cahier-des-charges.md` and `docs/research/input.md` are French; the code
  read at miralabs-ui `packages/core/src/input/spatial/geometry.ts` (header
  comment, lines 1-18) is English. Both read on 2026-09-18.
- Those design documents were deleted from the source repository on 2026-09-18
  by commit `289fa607`; they are readable with
  `git show 289fa607^:docs/research/input.md` and its sibling.
- Prior art is English-language: the competitor fact sheets verified on
  2026-09-18, published in [docs/research/competitors.md](../research/competitors.md).
- Rejection of bilingual ADRs: the owner's decision of 2026-09-18, recorded in
  this ADR.
- `docs/en` and `docs/fr` do not exist in this repository on 2026-09-18; rule 5
  and its gate are forward-looking.
- Related: [ADR-0003](0003-extraction-scope.md) (what is being extracted) and
  [ADR-0016](0016-scoring-constants-provenance.md) (the comments rule 3 keeps).
