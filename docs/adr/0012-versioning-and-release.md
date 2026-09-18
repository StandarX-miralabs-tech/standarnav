# ADR-0012: Versioning and release

Status: Accepted
Date: 2026-09-18
Deciders: Wesley Cormier

The versioning scheme and the publication channel are accepted. The changelog tool stays Proposed:
changesets is the working choice, release-please is the named alternative, and the owner confirms
before the first release.

## Context

standarnav is unreleased: `package.json` is at version `0.0.0` and nothing is on npm
(`registry.npmjs.org/@standarx%2Fnav` returned 404 on 2026-09-18). Everything about releasing has
to be decided now rather than inherited, because the source repository has no mechanism to copy:

- `.github/workflows/` in miralabs-ui contains `ci.yml` and nothing else — there is no
  `release.yml` (directory listing, 2026-09-18).
- `.changeset/` contains no changeset file (only a `.standardoc` entry): changesets were removed
  on 2026-09-18 and versions are bumped by hand.
- Distribution in that repository was by packed tarball (a `tarballs/` directory at the root),
  which is a workspace convenience, not a publication.

There is also an infrastructure constraint. GitHub Actions on the account carrying the source
organization is blocked: `gh run list -R miralabs-tech/miralabs-ui --limit 8` returned 8 runs out
of 8 in `failure` on 2026-09-18, with the annotation "The job was not started because recent
account payments have failed or your spending limit needs to be increased." The new organization
`StandarX-miralabs-tech` was created the same day and its billing has **not** been checked.
Automation described here cannot be assumed to run until it is.

One thing is already in place: `publishConfig` in `package.json:35-38` (read 2026-09-18) sets
`"access": "public"` and `"provenance": true`, so the package is built to be published with an
npm provenance attestation from a CI run — which only makes sense if publishing happens in CI.

## Decision

**Semver, starting at 0.x.** The first publication is `0.1.0`. While the major is 0, breaking
changes are allowed in a **minor** bump and forbidden in a patch. Every breaking change gets a
`Breaking` entry in the CHANGELOG stating the old and the new shape, in English
([ADR-0015](0015-language-policy.md)). The v1 freeze happens when the public surface stops
moving: the exports map of
[ADR-0011](0011-package-layout-and-adapters.md), the `data-snav-*` attribute names, and the
behaviour of the React and vanilla adapters. Until then, callers pin an exact minor.

**Conventional commits, enforced by review.** No bot gate at v0: the commit convention is a
review item in the pull-request checklist, and `feat` / `fix` / `perf` / `docs` / `refactor` /
`test` / `chore` / `ci` are the types in use. A commit message never carries an AI co-author
trailer; a pull request that adds one is not merged. Both rules are written in
[CONTRIBUTING.md](../../CONTRIBUTING.md).

**CHANGELOG generated from changesets** (`.changeset/*.md`, one per user-facing change, written
by the contributor in the pull request). This reintroduces the tool the source repository just
dropped, and the reason is that the two repositories are not in the same situation: in a private
workspace with one author, a hand-written bump loses nothing, because the author knows what
changed. In an open-source package, the person who knows what a change does to the consumer is
the contributor, at pull-request time — a changeset captures that sentence while the context is
fresh, and makes the release note a by-product of review instead of an archaeology exercise. It
also forces the contributor to state the bump level, which is exactly the judgement a maintainer
otherwise has to make alone, weeks later, for someone else's patch.

This tool choice is **Proposed**. The alternative is release-please, which derives both the
version and the changelog from the conventional-commit messages themselves, with no extra file to
write. The trade is: changesets asks for a deliberate sentence and supports a change spanning
several commits; release-please asks for nothing extra but makes the commit subject the release
note, and imposes the commit convention on every contributor with no room for "this commit is
not worth a line". Nothing is wired yet: there is no `.changeset/` directory and no changesets
dependency in this repository. Until the rider is settled,
[CONTRIBUTING.md](../../CONTRIBUTING.md) and
[the pull-request template](../../.github/PULL_REQUEST_TEMPLATE.md) say the same thing — the
pull-request description carries the one sentence describing the user-facing change, and that
sentence becomes the changelog entry.

**Publication from GitHub Actions only**, in a `release.yml` workflow to be written: build,
typecheck, lint, unit and browser suites, then `bun run check:package` — `scripts/check-package.ts`
packs the tarball and runs `publint` and `attw --profile esm-only` on it — then a publish with
provenance (`publishConfig.provenance` is already `true`) and the permission provenance needs.
Two points are **not verified today** and must be settled against the npm provenance
documentation before the first release: the minimum CLI version and permission block, and
whether `bun publish` emits the attestation — the repository forbids `npm` and `npx`
([CONTRIBUTING.md](../../CONTRIBUTING.md)), so a release workflow that has to call the npm CLI is
a documented exception, not a silent one. The publishing account must have 2FA enabled; publishing
is never done from a laptop.

**Pre-releases for device validation.** TV runtimes are the risky target and no device test has
ever been run (miralabs-ui `ROADMAP.md:112`, read 2026-09-18;
[ADR-0014](0014-device-and-browser-matrix.md)). Releases meant for device trials are
published as `0.x.y-next.N` under the npm dist-tag `next`; `latest` is only moved once the
supported-tier browser suite is green. No release note claims a device is supported before a
device test exists.

## Consequences

- A pull request that changes runtime behaviour states its user-facing effect in one sentence: in
  the pull-request description today, in a changeset once the tool is wired, and as a CI check once
  CI runs. A docs-only or refactor pull request says "no user-facing change" instead of skipping it.
- One version number covers core, engines and every adapter ([ADR-0011](0011-package-layout-and-adapters.md)),
  so the changelog entry must name the affected subpath — "fix(spatial)", not "fix".
- Nothing can be released until GitHub Actions is usable on the `StandarX-miralabs-tech`
  organization. That billing check is a release blocker, not a detail, and it has not been done.
- Provenance ties each published version to a public workflow run and a git commit. It also means
  an emergency publish from a developer machine is not a fallback: it would produce a release
  without an attestation, visibly different from every other version.
- 0.x with breaking minors means consumers must read the CHANGELOG before bumping. The README and
  the installation snippet therefore pin an exact minor while the major is 0.
- Choosing changesets adds a dependency and a `.changeset/` directory to the repository; if the
  owner prefers release-please, the migration is a one-time rewrite of the release workflow and no
  change to the versioning rules above.

## Alternatives considered

**Manual publish from the maintainer's laptop**, after a local build. Rejected: no
provenance attestation, no proof that what is on npm matches the tagged commit, no guarantee the
test suite ran, and a build that depends on one machine's toolchain. It is also the path that
makes a compromised developer machine a supply-chain event for everyone installing the package.

**Calendar versioning** (`2026.9.0`). Attractive for a project that ships continuously and honest
about "time passed, things changed". Rejected: consumers of a navigation library need a
machine-readable signal for "this breaks your focus behaviour", and a range like `^0.4.0` carries
that signal where a date does not.

**Hand-written CHANGELOG with manual bumps**, the state the source repository moved to on
2026-09-18. Rejected for this repository for the reason given above: it relies on a single author
remembering the intent of every change, which stops being true the moment an outside pull request
is merged.

**A bot enforcing conventional commits** (commitlint in CI). Not rejected on the merits, only
deferred: with CI blocked and no contributors yet, a review checklist costs nothing and a failing
required check that nobody can re-run costs a lot. Revisit once Actions runs.

## Evidence

- `package.json`, read 2026-09-18: `"version": "0.0.0"` (line 3),
  `"publishConfig": {"access": "public", "provenance": true}` (lines 35-38), scripts `dev`,
  `build`, `typecheck`, `lint`, `lint:fix`, `format`, `test`, `test:unit`, `test:browser`,
  `test:watch`, `bench`, `check:size`, `check:package`; devDependencies include
  `publint` `^0.3.24` and `@arethetypeswrong/cli` `^0.18.5`.
- npm name availability, 2026-09-18: `registry.npmjs.org/@standarx%2Fnav` → 404;
  `registry.npmjs.org/standarnav` → 404; scope search `scope:standarx` → 0 packages. The probes
  per candidate are recorded in [ADR-0001](0001-name-scope-and-attribute-prefix.md).
- Source repository miralabs-ui at `289fa607`, read-only, 2026-09-18: listing of
  `.github/workflows/` → `ci.yml` only; listing of `.changeset/` → no changeset file;
  a `tarballs/` directory at the repository root.
- CI billing: `gh run list -R miralabs-tech/miralabs-ui --limit 8` on 2026-09-18 → 8 `failure`,
  with the annotation "The job was not started because recent account payments have failed
  or your spending limit needs to be increased." Organization `StandarX-miralabs-tech` created
  2026-09-18 (`gh api repos/StandarX-miralabs-tech/standarnav` → 404 the same day); its billing
  state is unchecked.
- No TV device test has ever been run: miralabs-ui `ROADMAP.md:112`, read 2026-09-18.
- Related: [ADR-0003](0003-extraction-scope.md) for what is being released,
  [ADR-0011](0011-package-layout-and-adapters.md) for the surface a version number covers.
