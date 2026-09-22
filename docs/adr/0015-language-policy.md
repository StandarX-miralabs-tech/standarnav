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

The predecessor implementation this engine comes from mixed both languages: its
specification, its research note and most of its commit messages were French,
while its code, its identifiers and its code comments were English. That mix
works for a single author and stops working the moment an outside contributor
opens an issue: a French specification paragraph is a wall for a reader who can
read the code underneath it perfectly well.

The extraction (see [ADR-0003](0003-package-boundaries.md)) is the moment to fix
this, because it is the moment the repository becomes public and every file gets
rewritten anyway. Deciding afterwards would mean a translation pass over a
growing corpus.

Two needs pull in opposite directions. Contributors and readers need one
language they can all read. The owner thinks and drafts faster in French, and
throwing that away would slow down the design work that produces the documents
in the first place.

## Decision

1. Every committed Markdown file is English. That includes the README, the
   CHANGELOG, every ADR, the specification, issue and pull-request
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
   the owner has to confirm the mechanism before it is implemented. `docs/en`
   and `docs/fr` exist since 2026-09-22, four pages each (amendment at the
   foot of this record), so the gate has something to check and still does
   not exist.
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

## Amendment, 2026-09-22: `docs/en` exists, four pages, each with its mirror

Rule 5 stops being forward-looking. The README was cut from 238 lines to 79
(`wc -l README.md`, 2026-09-22, before and after the cut), and the four
sections a newcomer does not need on the first screen but a user needs
somewhere moved under `docs/en/`: `attributes.md` (the two attribute tables,
44 lines), `navigation.md` (how a move is decided, and what makes an element
navigable, 53), `react.md` (72) and `focus-ring.md` (38). Each has its
file-by-file mirror under `docs/fr/` (45, 61, 75 and 41 lines: French runs
longer), translated in the same pull request, so the merge condition of rule 5
is met by the first pages it applies to.

What a mirror is, made precise because the rule only said "strict": the prose
is translated, and everything that is the contract rather than its description
is identical on both sides — code blocks, attribute and custom property names,
cited paths, table cells that hold code. A French page that renamed an
attribute would be a different contract, not a translation. Headings are
translated; file names are not, so a reader switches language by changing one
path segment.

What did not change: the mechanism of rule 5 is still Proposed. The mirrors
carry no front matter and no blob hash, because the owner has not confirmed
that mechanism, and nothing in CI checks that a `docs/fr` page exists or is
current — review does, as the Consequences say. The rider stays open with
something to check now, which it did not have before.

## Alternatives considered

**Bilingual ADRs with an English summary.** Every ADR written in French with an
English abstract at the top. Rejected by the owner on 2026-09-18: it doubles the
maintenance of every decision record, and the abstract inevitably drifts from the
body it summarises. The reader who most needs the document is the one who only
gets the abstract.

**French canonical, English mirror.** The inverse of rule 5. Rejected: the code
is already English — every file under `src/`, comments included — so a French
canonical layer would sit on top of an English artefact and every API name in
every paragraph would be a foreign word. It also makes external contribution
strictly harder for no gain the owner needs.

**No policy — write whatever fits.** This is what the predecessor implementation
did. Rejected: it produced a specification the owner can read and a contributor
cannot, and there is no point at which such a corpus gets cheaper to fix.

**English only, no French at all, including private notes.** Rejected: it would
tax the owner's own drafting for no external benefit, since those notes are
untracked and no reader ever sees them.

## Evidence

- The owner's decision of 2026-09-18, recorded in this ADR: every committed
  Markdown file is English, code and comments are English, and French working
  notes stay untracked.
- That the predecessor mixed a French document set with English code is inherited
  from the predecessor implementation ([ADR-0002](0002-license-and-copyright.md))
  and not re-derived here: those documents are not in this tree, so no reader of
  this repository can check the claim. It is recorded because it is the problem
  rule 1 exists to prevent, not as evidence for anything this repository asserts.
- Prior art is English-language: the competitor fact sheets verified on
  2026-09-18, published in [docs/research/competitors.md](../research/competitors.md).
- Rejection of bilingual ADRs: the owner's decision of 2026-09-18, recorded in
  this ADR.
- `docs/en` and `docs/fr` did not exist in this repository on 2026-09-18, nor
  on 2026-09-20 (`ls docs/` → `adr/`, `research/`, `specification.md`). They
  exist since 2026-09-22: `ls docs/en docs/fr` lists `attributes.md`,
  `focus-ring.md`, `navigation.md` and `react.md` on each side. Rule 5 applies
  to them; its gate stays a proposal, and the rider above stays open.
- Rules 2 and 3 are satisfied by the code that arrived in the meantime: every
  file under `src/` is English, comments included. The
  committed Markdown of `docs/adr/` is English throughout.
- Related: [ADR-0003](0003-package-boundaries.md) (what is being extracted) and
  [ADR-0016](0016-scoring-constants-provenance.md) (the comments rule 3 keeps).
