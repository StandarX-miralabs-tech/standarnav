/**
 * Start-up for a page that has no framework and no mount hook to hang a system on.
 *
 * It is not an adapter — the core is the vanilla API ([ADR-0011](../../docs/adr/0011-package-layout-and-adapters.md)).
 * What it adds over calling `createInputSystem` yourself is exactly two things: it
 * waits for the document when the document is not ready, and it lets the page rather
 * than the script choose the navigation mode, by reading `data-snav-mode` off the root
 * element and handing it to the caller's plugin factory. Everything else a page can
 * say about navigation is already an attribute the spatial engine reads.
 *
 * No engine is imported here. `SpatialMode` arrives as a type, which erases, so a
 * consumer of this subpath who never imports `@standarx/nav/spatial` does not fetch it.
 */

import { createInputSystem, type InputPlugin, type InputSystem } from "../input-system";
import type { KeymapOverrides } from "../keymap";
import type { SpatialMode } from "../spatial/spatial";

export type { InputPlugin, InputSystem } from "../input-system";
export type { KeymapOverrides } from "../keymap";
export type { SpatialMode } from "../spatial/spatial";

/**
 * Read once, before the system exists, and never again: the mode is a property of the
 * engine instance ([ADR-0007](../../docs/adr/0007-navigation-modes.md)), so this is a
 * source for the option at construction and not a switch the running engine watches.
 */
export const MODE_ATTRIBUTE = "data-snav-mode";

export interface AutoConfig {
  /** The document the system was built on. */
  readonly doc: Document;
  /** The element `data-snav-mode` was read from. */
  readonly root: HTMLElement;
  /** `app` only for the exact string `app`; anything else, absent included, is `composite`. */
  readonly mode: SpatialMode;
}

/**
 * An array when the page knows its plugins, a factory when it wants the ones the
 * markup asked for. The factory runs once, after the document is ready.
 */
export type AutoPlugins = readonly InputPlugin[] | ((config: AutoConfig) => readonly InputPlugin[]);

export interface AutoMountOptions {
  readonly plugins?: AutoPlugins | undefined;
  /** Where `data-snav-mode` is read. Defaults to `doc.documentElement`. */
  readonly root?: HTMLElement | undefined;
  readonly doc?: Document | undefined;
  readonly keymap?: KeymapOverrides | undefined;
  readonly allowVerticalInText?: boolean | undefined;
}

export interface AutoMount {
  /** `null` while the document is still parsing, and again after `destroy`. */
  readonly system: InputSystem | null;
  /** Idempotent, and safe before the system was ever built. */
  destroy(): void;
}

function readMode(root: HTMLElement): SpatialMode {
  return root.getAttribute(MODE_ATTRIBUTE) === "app" ? "app" : "composite";
}

export function autoMount(options: AutoMountOptions = {}): AutoMount {
  const doc = options.doc ?? globalThis.document;
  // Typed as always present by lib.dom and absent for real on a server, the same
  // check `createInputSystem` makes and for the same reason.
  if (doc === undefined) {
    throw new Error("autoMount needs a document — call it in the browser, not on the server");
  }

  let system: InputSystem | null = null;
  let destroyed = false;
  let cancel: VoidFunction | null = null;

  const start = (): void => {
    cancel = null;
    if (destroyed) return;
    const root = options.root ?? doc.documentElement;
    const config: AutoConfig = { doc, root, mode: readMode(root) };
    system = createInputSystem({
      doc,
      plugins: typeof options.plugins === "function" ? options.plugins(config) : options.plugins,
      keymap: options.keymap,
      allowVerticalInText: options.allowVerticalInText,
    });
  };

  // A module script is deferred, so this is already past `loading` for most callers.
  // The branch is for the classic script in `<head>`, where building now would give
  // the spatial engine a document with no `<body>` to scan.
  if (doc.readyState === "loading") {
    const onReady = (): void => start();
    doc.addEventListener("DOMContentLoaded", onReady, { once: true });
    cancel = (): void => doc.removeEventListener("DOMContentLoaded", onReady);
  } else {
    start();
  }

  return {
    get system(): InputSystem | null {
      return system;
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      cancel?.();
      cancel = null;
      const instance = system;
      system = null;
      instance?.destroy();
    },
  };
}
