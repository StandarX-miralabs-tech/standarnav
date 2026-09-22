# Security policy

## Scope

This policy covers the standarnav library code (the `@standarx/nav` package
and its subpath exports: core, `gamepad`, `spatial`, `focus-ring`, `debug`,
`keyboard` with its `qwerty`, `azerty` and `alphabetic` layouts, and the
React adapter). It does not cover the local development page under
`playground/`, which is not shipped in the package, nor its copy on GitHub
Pages, a static build of that page published by `.github/workflows/pages.yml`
on every push to `main`: it runs no server and stores nothing.

The engine stores no user data and makes no network request. It reads DOM
geometry and attributes, keyboard and pointer events, and the Gamepad API when
a gamepad plugin is mounted; it writes DOM attributes and CSS custom properties
on the page that embeds it. That is the whole surface of the code under `src/`:
no telemetry, no analytics, no outbound request, and no browser storage. A
change that would introduce a network call needs an ADR.

## Supported versions

Nothing is published on npm on 2026-09-18: the table below states the policy
that applies from the first release onwards, not a list of existing
releases. The project has not reached v1. Until then, only the latest 0.x
minor release is supported with security fixes.

| Version | Supported |
|---|---|
| Latest 0.x minor | Yes |
| Any older 0.x minor | No |
| 1.x (once released) | Support policy to be defined at release |

## Reporting a vulnerability

Report a vulnerability using [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
on this repository (the "Security" tab, "Report a vulnerability"). Do not
open a public issue for a security report: a public issue exposes the
vulnerability before a fix exists.

If private vulnerability reporting is unavailable to you for any reason,
contact the maintainer directly on GitHub (@SUP2Ak) instead. Do not use
email for a security report.

Include, where you can: the affected version or, while the package is
unreleased, the commit hash you built from; a minimal reproduction; and the
potential impact as you understand it.

## Response targets

These are targets the maintainer intends to meet, not guarantees:

- Acknowledge a new report within 7 days.
- For a confirmed issue, provide a fix or a mitigation plan within 30 days.

A report that turns out not to be a vulnerability, or that needs more
information to confirm, may take longer to resolve than these targets.
