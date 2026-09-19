import { describe, expect, it } from "vitest";
import { createInputSystem } from "./input-system";

describe("createInputSystem", () => {
  it("throws its own message, unprefixed, when there is no document", () => {
    expect(() => createInputSystem()).toThrow(
      "createInputSystem needs a document — call it from an effect, not during render or on the server",
    );
    // The source wrapped every invariant in "[miralabs] ". Nothing else in the
    // suite would notice the prefix coming back.
    expect(() => createInputSystem()).not.toThrow(/^\[/);
  });
});
