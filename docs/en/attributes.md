# The markup contract

Two tables. The first is what the application writes and the engine reads; the second is what the
engine writes and the application can style against. Both are this repository's own contract, set
by [ADR-0001](../adr/0001-name-scope-and-attribute-prefix.md), and both are part of what is not
frozen before v1: while the major is 0, a minor may rename one, and the CHANGELOG says so when it
does.

## Read by the engine

| Attribute | Placed on | Value | Effect |
|---|---|---|---|
| `data-snav="container"` | any element | fixed | Declares a navigation container; moves are scored inside it first. |
| `data-snav-enter` | a container | `last` \| `first` \| `nearest` | Which element takes focus when a move enters. Default `last`, which falls back to `nearest` when the remembered element is gone. |
| `data-snav-wrap` | a container | `x` \| `y` \| `both`, or bare | Wraps to the opposite edge instead of leaving the container. |
| `data-snav-block` | a container | directions separated by spaces, or bare | Blocks those exits; bare blocks every one. |
| `data-snav-trap` | a container | bare | A move never leaves this container. |
| `data-snav-scroll` | a container | `center` | Scrolls a newly focused element to the centre instead of `nearest`. |
| `data-snav-ignore` | any element | bare | Excludes the element from the candidate list. |
| `data-snav-up` / `-down` / `-left` / `-right` | a focusable | a CSS selector | Sends that direction to the first match in the document, before any geometry runs. |

A container is any element carrying `data-snav="container"`, and `body` is the default container
when no ancestor declares one ([ADR-0006](../adr/0006-declarative-first.md)). A nested container
counts as one candidate to its parent, scored as a single rectangle, not as all of its children.
How the engine walks these attributes on a move is in [navigation.md](navigation.md).

## Written by the engine

| Attribute | Written on | Values |
|---|---|---|
| `data-snav-focused` | the focused element | bare |
| `data-snav-active` | every container on the path to the focused element | bare |
| `data-snav-input` | `<html>` | `keyboard` \| `pointer` \| `touch` \| `gamepad` |
| `data-snav-focus-ring` | the focus ring overlay element, when the ring plugin is mounted | bare |
| `data-snav-editing` | the field the on-screen keyboard is open on, when the keyboard plugin is mounted | bare |
| `data-snav-keyboard` | the on-screen keyboard's box | the layout's id |
| `data-snav-keyboard-row` | each row of keys in that box; `[data-snav-keyboard-row] button` is a key | bare |
| `data-snav-keyboard-preview` | the preview row at the bottom of the box, which mirrors the field and moves its caret | bare |
| `data-snav-keyboard-caret` | the caret drawn inside the preview row | bare |

The attribute constants live in `src/spatial/containers.ts`, `src/modality.ts`,
`src/focus-ring/focus-ring.ts` and `src/keyboard/keyboard.ts`. The names of the navigation
attributes stay private and are not part of the public API: the tables above are the contract,
not the modules.
