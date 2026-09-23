/**
 * The server's answer, rendered where there is no DOM at all: Node, with no `document`
 * global to fall back on. A provider that built its system during setup, or a composable
 * that read the document before mount, throws here rather than rendering.
 */

import { describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import {
  NavDocumentProvider,
  NavProvider,
  useInputModality,
  useInputSystem,
  useIntent,
  useIntentScopeHost,
} from "./vue";

describe("the Vue adapter on a server", () => {
  it("renders every composable's first answer with no document, and builds nothing", async () => {
    expect(typeof document).toBe("undefined");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc = vi.fn(() => {
      throw new Error("the document was read on the server");
    });
    const Child = defineComponent(() => {
      const system = useInputSystem();
      const modality = useInputModality();
      useIntent(() => true, { trapped: true, within: () => null });
      const host = useIntentScopeHost();
      host?.pushScope(() => true);
      return () =>
        h("span", `${system.value === null ? "none" : "built"}:${modality.value}:${host !== null}`);
    });
    const Orphan = defineComponent(() => {
      useIntent(() => true);
      return () => h("i");
    });

    try {
      const html = await renderToString(
        createSSRApp({
          render: () =>
            h(NavDocumentProvider, { doc }, () => [
              h(NavProvider, null, () => h(Child)),
              h(Orphan),
            ]),
        }),
      );

      expect(html).toContain("none:pointer:true");
      expect(doc).not.toHaveBeenCalled();
      // The missing-provider warning belongs to a mount, and nothing mounts on a server.
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
