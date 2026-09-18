# Journal

One entry per working session, written the day of the session. The file name is the date:
`docs/journal/YYYY-MM-DD.md`.

An entry may still be amended up to the commit that publishes it, so that the session is recorded
accurately. Once that commit is pushed, the entry is frozen: a later entry corrects it and says
which entry it corrects.

Rules for an entry:

- English, like every committed Markdown file of this repository.
- Every number carries the command, the protocol, the measurement date or the URL that produced it.
  A number inherited from another repository and not re-measured here is labelled as inherited.
- Negative results are recorded: names already taken, facts that could not be verified, tests that do
  not exist, tools that did not run.
- Decisions are recorded with who took them and what they decide, in words a reader outside the
  session understands, and are linked to the ADR under `docs/adr/` that carries the reasoning. No
  internal shorthand for a decision.
- No absolute local path and no path into an uncommitted folder: a reader only has this repository,
  so every piece of evidence is a document under `docs/`, a command with its output, or a URL. An
  entry may record that a working file existed and was not committed; it never says where it lives.
- No claim that the package is published, tested on a device, or benchmarked end to end, unless the
  entry carries the command and the date that prove it.
- Sources are cited by repository, path and line. For the source repository:
  `miralabs-ui: packages/core/src/input/spatial/spatial.ts:198`. For this one:
  `src/spatial/spatial.ts`.

An entry is a log, not a report: what was attempted, what was measured, what was decided, what failed.
