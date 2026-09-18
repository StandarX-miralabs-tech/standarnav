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
affected subpath. This is what the CHANGELOG entry is written from at release time:
ADR-0012 proposes changesets, but no tool is wired yet, so the sentence lives here.
Documentation-only or internal changes: write "internal only" instead.
-->

## Checklist

- [ ] Tests added or updated, and green on Chromium, Firefox, and WebKit (`bun run test:browser`).
- [ ] Size budget respected. Run `bun run build` then `bun run check:size`, and paste the
      lines for every entry this pull request touches. Every cap is `null` today, so the
      run fails and prints the measurement instead of passing — paste it anyway.

  ```
  <paste here>
  ```

- [ ] No documentation claim without proof (a test, a measurement with its command and date, or a source URL).
- [ ] English only in code, comments, commit message, and any `.md` file touched.
- [ ] No AI co-author trailer in the commit message.
- [ ] `docs/fr` mirror updated if `docs/en` changed (a page without its mirror does not merge).
- [ ] ADR added or amended if this PR changes a decision already recorded in `docs/adr/`.
