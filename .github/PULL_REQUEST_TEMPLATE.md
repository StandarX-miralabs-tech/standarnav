## Summary

<!-- What does this change do, and why. -->

## Linked issue

Closes #

## Type of change

<!-- Pick the conventional commit type this PR matches. -->

- [ ] feat
- [ ] fix
- [ ] perf
- [ ] docs
- [ ] refactor
- [ ] test
- [ ] chore
- [ ] ci

## User-facing change

<!--
One sentence describing what changed for someone consuming the package, naming the
affected subpath. It becomes the subject of the squash merge, which is what release-please
writes the CHANGELOG entry from (ADR-0012), so write it as the release note it is.
Documentation-only or internal changes: write "internal only" instead, and type the
commit `docs`, never `fix(docs)`: `fix` publishes a release.
-->

## Checklist

- [ ] Tests added or updated, and green on Chromium, Firefox, and WebKit (`bun run test:browser`).
- [ ] Size budget respected. Run `bun run build` then `bun run check:size`, and paste the
      lines for every entry this pull request touches. All twelve lines are capped and the
      run passes today, so a non-zero exit is this change — reduce the size, or link an
      ADR-0017 amendment proposing the new cap.

  ```
  <paste here>
  ```

- [ ] `bun run build` left the tree clean, or the rewritten `exports` map in `package.json`
      is committed with the change (`git diff --exit-code` is a CI gate).
- [ ] No documentation claim without proof (a test, a measurement with its command and date, or a source URL).
- [ ] Every path cited in a document was opened at the line cited, and
      `bun run scripts/check-citations.ts` passes. Every cited path is a path in this
      repository; no absolute filesystem path, nothing from the gitignored
      `.local` scratch directory.
- [ ] English only in code, comments, commit message, and any `.md` file touched.
- [ ] No AI co-author trailer in the commit message.
- [ ] `docs/fr` mirror updated if `docs/en` changed (a page without its mirror does not merge).
- [ ] ADR added or amended if this PR changes a decision already recorded in `docs/adr/`.
