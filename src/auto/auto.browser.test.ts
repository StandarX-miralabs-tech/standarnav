import { afterEach, describe, expect, it } from "vitest";
import type { InputPlugin } from "../input-system";
import { MODALITY_ATTRIBUTE } from "../modality";
import { type AutoConfig, autoMount, MODE_ATTRIBUTE } from "./auto";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
  document.documentElement.removeAttribute(MODE_ATTRIBUTE);
});

function mount(options: Parameters<typeof autoMount>[0] = {}): ReturnType<typeof autoMount> {
  const handle = autoMount(options);
  cleanups.push(() => handle.destroy());
  return handle;
}

/** Counts its own setups and teardowns, so a test can prove the system reached it. */
function spyPlugin(): InputPlugin & { readonly setups: string[]; readonly teardowns: string[] } {
  const setups: string[] = [];
  const teardowns: string[] = [];
  return {
    name: "spy",
    setups,
    teardowns,
    setup(): VoidFunction {
      setups.push("setup");
      return () => void teardowns.push("teardown");
    },
  };
}

function textField(): HTMLInputElement {
  const field = document.createElement("input");
  field.type = "text";
  document.body.append(field);
  cleanups.push(() => field.remove());
  field.focus();
  return field;
}

function press(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/**
 * A document that has not finished parsing. No engine hands one over on demand, and
 * the branch under test reads `readyState` and nothing else, so shadowing that
 * accessor is the whole of the fixture.
 */
function loadingDocument(): Document {
  const doc = document.implementation.createHTMLDocument("");
  Object.defineProperty(doc, "readyState", { configurable: true, get: () => "loading" });
  return doc;
}

function finishParsing(doc: Document): void {
  Object.defineProperty(doc, "readyState", { configurable: true, get: () => "complete" });
  doc.dispatchEvent(new Event("DOMContentLoaded"));
}

describe("autoMount — building the system", () => {
  it("builds the system straight away on a document that is already parsed", () => {
    const plugin = spyPlugin();
    const handle = mount({ plugins: [plugin] });

    expect(handle.system).not.toBeNull();
    expect(plugin.setups).toEqual(["setup"]);
  });

  it("takes a plain array of plugins", () => {
    const first = spyPlugin();
    const second = spyPlugin();
    mount({ plugins: [first, second] });

    expect(first.setups).toEqual(["setup"]);
    expect(second.setups).toEqual(["setup"]);
  });

  it("forwards the keymap, so a silenced key produces no intent", () => {
    const handle = mount({ keymap: { keys: { ArrowDown: null } } });
    const seen: string[] = [];
    cleanups.push(handle.system?.onIntent((event) => void seen.push(event.intent)) ?? (() => {}));

    press(document, "ArrowDown");
    press(document, "ArrowUp");

    expect(seen).toEqual(["moveUp"]);
  });

  it("forwards allowVerticalInText, so a vertical move leaves a text field", () => {
    const handle = mount({ allowVerticalInText: true });
    const seen: string[] = [];
    cleanups.push(handle.system?.onIntent((event) => void seen.push(event.intent)) ?? (() => {}));

    press(textField(), "ArrowDown");

    expect(seen).toEqual(["moveDown"]);
  });

  it("keeps a text field a dead end when allowVerticalInText is left alone", () => {
    const handle = mount();
    const seen: string[] = [];
    cleanups.push(handle.system?.onIntent((event) => void seen.push(event.intent)) ?? (() => {}));

    press(textField(), "ArrowDown");

    expect(seen).toEqual([]);
  });
});

describe("autoMount — the mode comes from the markup", () => {
  it("hands the factory `app` when the root says so", () => {
    document.documentElement.setAttribute(MODE_ATTRIBUTE, "app");
    const configs: AutoConfig[] = [];
    mount({
      plugins: (config) => {
        configs.push(config);
        return [];
      },
    });

    expect(configs).toHaveLength(1);
    expect(configs[0]?.mode).toBe("app");
    expect(configs[0]?.root).toBe(document.documentElement);
    expect(configs[0]?.doc).toBe(document);
  });

  it("falls back to composite when the attribute is absent", () => {
    const configs: AutoConfig[] = [];
    mount({
      plugins: (config) => {
        configs.push(config);
        return [];
      },
    });

    expect(configs[0]?.mode).toBe("composite");
  });

  it("falls back to composite for a value it does not recognise", () => {
    document.documentElement.setAttribute(MODE_ATTRIBUTE, "APP");
    const configs: AutoConfig[] = [];
    mount({
      plugins: (config) => {
        configs.push(config);
        return [];
      },
    });

    expect(configs[0]?.mode).toBe("composite");
  });

  it("reads the attribute off an explicit root rather than the document element", () => {
    document.documentElement.setAttribute(MODE_ATTRIBUTE, "composite");
    const root = document.createElement("div");
    root.setAttribute(MODE_ATTRIBUTE, "app");
    document.body.append(root);
    cleanups.push(() => root.remove());

    const configs: AutoConfig[] = [];
    mount({
      root,
      plugins: (config) => {
        configs.push(config);
        return [];
      },
    });

    expect(configs[0]?.mode).toBe("app");
    expect(configs[0]?.root).toBe(root);
  });
});

describe("autoMount — a document that is still parsing", () => {
  it("builds nothing until DOMContentLoaded, then builds once", () => {
    const doc = loadingDocument();
    const plugin = spyPlugin();
    const handle = mount({ doc, plugins: [plugin] });

    expect(handle.system).toBeNull();
    expect(plugin.setups).toEqual([]);

    finishParsing(doc);

    expect(handle.system).not.toBeNull();
    expect(plugin.setups).toEqual(["setup"]);
  });

  it("runs the plugin factory after the document is ready, not before", () => {
    const doc = loadingDocument();
    const modes: string[] = [];
    mount({
      doc,
      plugins: ({ mode }) => {
        modes.push(mode);
        return [];
      },
    });

    expect(modes).toEqual([]);
    doc.documentElement.setAttribute(MODE_ATTRIBUTE, "app");
    finishParsing(doc);

    expect(modes).toEqual(["app"]);
  });

  it("never builds a system when it is destroyed before the document is ready", () => {
    const doc = loadingDocument();
    const plugin = spyPlugin();
    const handle = autoMount({ doc, plugins: [plugin] });

    handle.destroy();
    finishParsing(doc);

    expect(handle.system).toBeNull();
    expect(plugin.setups).toEqual([]);
  });
});

describe("autoMount — destroy", () => {
  it("tears the system down and leaves nothing listening", () => {
    const handle = autoMount({ plugins: [spyPlugin()] });
    press(document, "ArrowDown");
    expect(document.documentElement.hasAttribute(MODALITY_ATTRIBUTE)).toBe(true);

    handle.destroy();

    expect(handle.system).toBeNull();
    expect(document.documentElement.hasAttribute(MODALITY_ATTRIBUTE)).toBe(false);
  });

  it("runs every plugin teardown once, however many times it is called", () => {
    const plugin = spyPlugin();
    const handle = autoMount({ plugins: [plugin] });

    handle.destroy();
    handle.destroy();
    handle.destroy();

    expect(plugin.teardowns).toEqual(["teardown"]);
  });
});
