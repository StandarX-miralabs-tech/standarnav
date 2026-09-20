import { describe, expect, it } from "vitest";
import { createInputSystem } from "./input-system";

describe("createInputSystem", () => {
  it("throws its own message, unprefixed, when there is no document", () => {
    expect(() => createInputSystem()).toThrow(
      "createInputSystem needs a document — call it from an effect, not during render or on the server",
    );
    // The implementation this was extracted from wrapped every invariant in a
    // bracketed prefix. Nothing else in the suite would notice one coming back.
    expect(() => createInputSystem()).not.toThrow(/^\[/);
  });
});
