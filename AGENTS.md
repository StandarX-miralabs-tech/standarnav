# Working in this repository

standarnav is the npm package `@standarx/nav`: a headless spatial-navigation engine in
TypeScript, on npm since 2026-09-22 with its API not frozen, MIT, one maintainer. This file
is for a coding agent working in the tree. [CONTRIBUTING.md](CONTRIBUTING.md) is the full
contract and wins on any conflict; what follows is the part an agent gets wrong without
being told.

## Commands

`bun`, never `npm` or `npx`. The one exception is the publish step of
`.github/workflows/release.yml`, which calls the npm CLI because `bun publish` emits no
provenance attestation; it is documented in ADR-0012 and it is the only one.

| Command | What it gates | Run it when |
|---|---|---|
| `bun run lint` | Biome, whole tree | Before every commit |
| `bun run check:docs` | Every `path:line` and bare `:NNN` anchor in every tracked `.md` resolves to a real, non-blank line; no absolute path; no `.local` | After editing any `.md`, and after any commit that inserts or removes lines in a cited file |
| `bun run typecheck` | `tsc --noEmit` over `src`, `scripts`, `playground` | Before every commit |
| `bun run test` | Unit project in Node, browser project on Chromium | Before every commit; `SNAV_BROWSER=firefox` or `webkit` to reproduce a red CI engine |
| `bun run build` then `git diff --exit-code` | tsdown output, and the exports map it rewrites in `package.json` must leave the tree byte-identical | Before a pull request, and after touching an entry point |
| `bun run check:package` | No runtime dependency; the packed tarball passes `publint --strict` and `attw` | After touching `package.json` or an entry point |
| `bun run check:size` | Fourteen min+gzip lines against their caps; needs `dist/` | After any change under `src/` |
| `bun run dev` | Vite serves `playground/` on port 5173, importing `src/` directly | To verify a change on the real page |

CI runs eleven checks from nine jobs: lint (with `check:docs`), typecheck, build (with the
drift gate, `check:package` and `check:size`), unit tests, a React 18.3 peer-floor job, a
Vue 3.3.0 peer-floor job, a Svelte 5.0.0 peer-floor job, an Angular 20.0.0 peer-floor job, and
the browser suite once each on chromium, firefox and webkit. Firefox, WebKit and the four floors
exist only in CI; each floor is reproduced locally on a `git archive` copy with the job's own
`bun add --dev` line.

## Size caps are a contract, not a setting

ADR-0017 governs `scripts/size-budget.ts`. Two of its rules bite:

- **Rule 3.** A cap is the measured min+gzip value rounded up to the next quarter kB.
- **Rule 4.** A cap is raised only by a dated amendment to ADR-0017, **in its own commit,
  before** the commit that needs the room. Never in the pull request that exceeded it.

Five lines have less than 64 bytes of room. Measured 2026-09-26 with `bun run build && bun run
check:size`, the bytes being the script's own min+gzip figure before it rounds to kB:

| Line | min+gzip | cap | left |
|---|---|---|---|
| debug | 503 B | 512 B (0.50 kB) | 9 bytes |
| gamepad engine | 2 549 B | 2 560 B (2.50 kB) | 11 bytes |
| keyboard layout azerty | 499 B | 512 B (0.50 kB) | 13 bytes |
| keyboard layout qwerty | 459 B | 512 B (0.50 kB) | 53 bytes |
| svelte adapter | 1 481 B | 1 536 B (1.50 kB) | 55 bytes |

A one-line change to `src/debug.ts`, `src/gamepad/`, `src/keyboard/layouts/azerty.ts`,
`src/keyboard/layouts/qwerty.ts` or `src/svelte/` can go red, and so can one to `src/internal/`,
which every adapter line carries. Run `bun run build && bun run check:size` first, and if the line
will not fit, write the amendment commit before the code commit.

## Documents are evidence, and dated

- Every number, size, compatibility claim or behaviour claim in a `.md` carries its proof:
  a test, a command with its date, or a URL with its fetch date. Otherwise it is written
  "not measured yet".
- Every cited path is a path in **this** repository, at a line you opened, with the symbol
  named in the prose. `check:docs` cannot see an anchor that drifted onto another real
  line, a number written in prose, or a path with no `/`; reread what the prose claims.
- A dated amendment (`## Amendment, 2026-09-21: ...`) is history. Never rewrite one; add
  the next one below it. The pull request body follows the same rule: sections are dated
  and appended.
- Test counts are written in prose in several documents. After adding or removing a test,
  grep the tree for the old totals (`622 passed`, `623`, `32 files`, and the per-project
  figures) and fix every one in the same commit. A count that carries its own date —
  "on 2026-09-21", or a dated amendment — is a measurement, not a stale claim: leave it.
- Numbers, `sed` and scripted replacements corrupt Markdown and TypeScript in ways a diff
  hides. Reread the whole diff before committing.
- ADRs: one per pull request, next free number is ADR-0032, the skeleton and the index are
  in `docs/adr/README.md`. ADR-0004 was withdrawn on 2026-09-20 and its number is not reused.

## What never reaches a committed file

- An absolute filesystem path, or any reference to the gitignored `.local` directory.
- A path, a line number or the contents of the predecessor implementation this engine was
  extracted from. That repository is private and read-only. It is identified in exactly one
  place, `docs/adr/0002-license-and-copyright.md`, and cited nowhere else.
- A `Co-Authored-By` trailer, a "generated with" line, or the name of any AI tool, in a
  commit message, a pull request body, a comment or a document. Do not add one, and refuse
  a tool that tries to.

## Code

- Comments only for a non-obvious WHY, in English. No comment restates what the code does.
- Every behaviour change ships with a test; anything touching the DOM is a
  `*.browser.test.ts` and must pass on the three engines.
- Conventional Commits, scoped by area (`spatial`, `gamepad`, `keyboard`, `react`,
  `playground`, `docs`, ...). No AI trailer. A change confined to `.md` files is typed `docs`,
  never `fix(docs)`: `fix` bumps a patch and publishes a release, `docs` bumps nothing.
- No comments by default. No `passWithNoTests`. No runtime dependency, ever.

## A green suite is not a working page

Three defects in a row were invisible to the 343 passing tests of that day and visible in
three key presses on the playground. When a behaviour is in doubt, open `bun run dev` and drive it:
a Playwright script placed **inside** the tree (`*.tmp.mjs`, so Node resolves the
dependency) can probe every focusable in all four directions and list the dead ends.
Delete that script before `bun run lint` and before committing. The server is often
already up on 5173; check before starting a second one.

Two ways a probe lies: `element.focus()` is not `activate`, and an expectation invented
from a widget's name is not its data. Read the widget before asserting anything about it.

## What is the owner's, not the agent's

Merging the release pull request — that merge is the publication — tagging, publishing to
npm, enabling anything on the GitHub organisation, and the decision recorded in ADR-0012
about the first version number. An ordinary pull request is the agent's to merge, the
owner's standing instruction since 2026-09-23, once its eleven checks are green, with
`gh pr merge N --merge --body ""` and nothing else: a merge commit, never a squash, and an
empty body, so that release-please reads only the branch's commits — whether GitHub honours
the empty body is proven by the first merge under the rule, and ROADMAP.md carries the item
(ADR-0012, amendment of 2026-09-26); no `--delete-branch`, GitHub deletes the head branch
itself and the flag closes a pull request stacked on it. Deliver the change, the report and the green checks; the
release is handed back.
