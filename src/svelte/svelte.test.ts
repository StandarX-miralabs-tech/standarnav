/**
 * The server's answer, rendered where there is no DOM at all: Node, with no `document`
 * global to fall back on, and Svelte's server runtime, where `onMount` never runs. A provider
 * that built its system while its component initialised, or a function that read the document
 * before mount, throws here rather than rendering.
 */

import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";
import SsrRoot from "./fixtures/SsrRoot.svelte";

describe("the Svelte adapter on a server", () => {
  it("renders every function's first answer with no document, and builds nothing", () => {
    expect(typeof document).toBe("undefined");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc = vi.fn(() => {
      throw new Error("the document was read on the server");
    });

    try {
      const { body } = render(SsrRoot, { props: { doc } });

      expect(body).toContain("none:pointer:true");
      expect(doc).not.toHaveBeenCalled();
      // The missing-provider warning belongs to a mount, and nothing mounts on a server.
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
