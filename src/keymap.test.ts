import { describe, expect, it } from "vitest";
import { isIntentAllowedInTextEntry, type KeyDescriptor, resolveKeyIntent } from "./keymap";

function key(key: string, extra: Partial<KeyDescriptor> = {}): KeyDescriptor {
  return { key, ...extra };
}

describe("resolveKeyIntent", () => {
  it("maps the arrows to physical directions", () => {
    expect(resolveKeyIntent(key("ArrowUp"))).toEqual({ intent: "moveUp", source: "keyboard" });
    expect(resolveKeyIntent(key("ArrowLeft"))).toEqual({ intent: "moveLeft", source: "keyboard" });
  });

  it("does not mirror the arrows for RTL", () => {
    // A d-pad has no writing direction and the spatial engine scores real
    // geometry, so nothing here may flip. Whoever derives "next/prev" resolves
    // direction instead, outside this package.
    const ltr = resolveKeyIntent(key("ArrowRight"));
    expect(ltr).toEqual({ intent: "moveRight", source: "keyboard" });
  });

  it("activates on Enter and Space, and dismisses on Escape", () => {
    expect(resolveKeyIntent(key("Enter"))?.intent).toBe("select");
    expect(resolveKeyIntent(key(" "))?.intent).toBe("select");
    expect(resolveKeyIntent(key("Spacebar"))?.intent).toBe("select");
    expect(resolveKeyIntent(key("Escape"))?.intent).toBe("back");
    expect(resolveKeyIntent(key("Esc"))?.intent).toBe("back");
  });

  it("reads Shift only for the two rows built on it", () => {
    expect(resolveKeyIntent(key("Tab"))?.intent).toBe("tabNext");
    expect(resolveKeyIntent(key("Tab", { shiftKey: true }))?.intent).toBe("tabPrev");
    expect(resolveKeyIntent(key("F10", { shiftKey: true }))?.intent).toBe("contextMenu");
  });

  it("leaves Shift+arrow to the component that owns range selection", () => {
    expect(resolveKeyIntent(key("ArrowDown", { shiftKey: true }))).toBeNull();
  });

  it("treats a held modifier as an application shortcut", () => {
    expect(resolveKeyIntent(key("ArrowDown", { ctrlKey: true }))).toBeNull();
    expect(resolveKeyIntent(key("Home", { metaKey: true }))).toBeNull();
    expect(resolveKeyIntent(key("Enter", { altKey: true }))).toBeNull();
  });

  it("understands the webOS and Tizen back keys", () => {
    expect(resolveKeyIntent(key("Unidentified", { keyCode: 461 }))).toEqual({
      intent: "back",
      source: "remote",
    });
    expect(resolveKeyIntent(key("Unidentified", { keyCode: 10009 }))).toEqual({
      intent: "back",
      source: "remote",
    });
    expect(resolveKeyIntent(key("Unidentified", { keyCode: 10182 }))?.intent).toBe("back");
  });

  it("pages on channel up and down, by name or by code", () => {
    expect(resolveKeyIntent(key("ChannelUp"))).toEqual({ intent: "pageUp", source: "remote" });
    expect(resolveKeyIntent(key("Unidentified", { keyCode: 428 }))).toEqual({
      intent: "pageDown",
      source: "remote",
    });
  });

  it("prefers a named key over the numeric code that shadows it", () => {
    // A desktop ArrowDown carries keyCode 40; the name table answers first so no
    // laptop key can ever fall through into the remote rows.
    expect(resolveKeyIntent(key("ArrowDown", { keyCode: 40 }))).toEqual({
      intent: "moveDown",
      source: "keyboard",
    });
  });

  it("returns nothing for a key it does not know", () => {
    expect(resolveKeyIntent(key("a"))).toBeNull();
    expect(resolveKeyIntent(key("Unidentified", { keyCode: 999 }))).toBeNull();
  });

  describe("overrides", () => {
    it("adds a row", () => {
      expect(resolveKeyIntent(key("Backspace"), { keys: { Backspace: "back" } })).toEqual({
        intent: "back",
        source: "keyboard",
      });
    });

    it("disables a default row with null", () => {
      expect(resolveKeyIntent(key(" "), { keys: { " ": null } })).toBeNull();
    });

    it("takes a numeric code as a remote", () => {
      expect(
        resolveKeyIntent(key("Unidentified", { keyCode: 403 }), {
          keyCodes: { 403: "contextMenu" },
        }),
      ).toEqual({ intent: "contextMenu", source: "remote" });
    });

    it("wins over Shift's own rows", () => {
      expect(resolveKeyIntent(key("Tab", { shiftKey: true }), { keys: { Tab: null } })).toBeNull();
    });
  });
});

describe("isIntentAllowedInTextEntry", () => {
  it("lets dismissal and tabbing out of a field", () => {
    expect(isIntentAllowedInTextEntry("back", false)).toBe(true);
    expect(isIntentAllowedInTextEntry("tabNext", false)).toBe(true);
    expect(isIntentAllowedInTextEntry("tabPrev", false)).toBe(true);
    expect(isIntentAllowedInTextEntry("contextMenu", false)).toBe(true);
  });

  it("keeps the caret gestures for the caret", () => {
    expect(isIntentAllowedInTextEntry("moveLeft", true)).toBe(false);
    expect(isIntentAllowedInTextEntry("home", true)).toBe(false);
    expect(isIntentAllowedInTextEntry("select", true)).toBe(false);
  });

  it("releases the vertical pair only when asked", () => {
    expect(isIntentAllowedInTextEntry("moveDown", false)).toBe(false);
    expect(isIntentAllowedInTextEntry("moveDown", true)).toBe(true);
    expect(isIntentAllowedInTextEntry("pageUp", true)).toBe(true);
  });
});
