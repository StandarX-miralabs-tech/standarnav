import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { type ParityProbe, type ParityTree, runAdapterParitySuite } from "../adapter-parity";
import { keyboardPlugin } from "../keyboard/keyboard";
import { alphabetic } from "../keyboard/layouts/alphabetic";
import { spatialPlugin } from "../spatial/spatial";
import App from "./fixtures/App.svelte";
import Button from "./fixtures/Button.svelte";
import Composite from "./fixtures/Composite.svelte";
import Dialog from "./fixtures/Dialog.svelte";
import Field from "./fixtures/Field.svelte";
import HookScope from "./fixtures/HookScope.svelte";
import HostScope from "./fixtures/HostScope.svelte";
import Leaky from "./fixtures/Leaky.svelte";
import Machine from "./fixtures/Machine.svelte";
import Order from "./fixtures/Order.svelte";
import Page from "./fixtures/Page.svelte";
import ParityTreeComponent from "./fixtures/ParityTree.svelte";
import Probe from "./fixtures/Probe.svelte";
import RadioGroup from "./fixtures/RadioGroup.svelte";
import Reader from "./fixtures/Reader.svelte";
import Scope from "./fixtures/Scope.svelte";
import Sizes from "./fixtures/Sizes.svelte";
import Tree from "./fixtures/Tree.svelte";
import type {
  InputModality,
  InputSystem,
  IntentHandler,
  IntentScopeHost,
  KeymapOverrides,
} from "./svelte";
import {
  type Mounted,
  mount,
  node,
  settle,
  state,
  systems,
  type TreeNode,
  takeWarnings,
  unmountAll,
} from "./svelte-harness";

afterEach(() => {
  unmountAll();
  expect(takeWarnings()).toEqual([]);
});

function press(key = "ArrowDown"): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

function recorder(): {
  readonly seen: string[];
  readonly handler: (name: string) => IntentHandler;
} {
  const seen: string[] = [];
  return {
    seen,
    handler: (name) => () => {
      seen.push(name);
      return false;
    },
  };
}

function app(
  options: unknown,
  nodes: () => readonly TreeNode[],
  extra: Record<string, unknown> = {},
): Mounted {
  return mount(App, { options, nodes, ...extra });
}

describe("provideNav — what does and does not rebuild the system", () => {
  it("keeps the system when the getter returns a fresh array around the same plugins", async () => {
    const plugins = [spatialPlugin()];
    const { all, seen } = systems();
    const tick = state(0);
    app(
      () => {
        void tick.current;
        return { plugins: [...plugins] };
      },
      () => [node("probe", Probe, { onSystem: seen })],
    );
    await settle();
    tick.current = 1;
    await settle();

    expect(all).toHaveLength(1);
  });

  it("keeps the system when the getter returns a fresh keymap literal with the same keys", async () => {
    const { all, seen } = systems();
    const tick = state(0);
    app(
      () => {
        void tick.current;
        return { keymap: { keys: { w: "moveUp" } } };
      },
      () => [node("probe", Probe, { onSystem: seen })],
    );
    await settle();
    tick.current = 1;
    await settle();

    expect(all).toHaveLength(1);
  });

  it("rebuilds when the plugins themselves are built in the getter", async () => {
    const { all, seen } = systems();
    const tick = state(0);
    // A new plugin object each time the getter re-runs: the contents changed, so the system
    // is rebuilt. Kept to make the cost visible, not to bless it.
    app(
      () => {
        void tick.current;
        return { plugins: [spatialPlugin()] };
      },
      () => [node("probe", Probe, { onSystem: seen })],
    );
    await settle();
    tick.current = 1;
    await settle();

    expect(all).toHaveLength(2);
  });

  it("takes the options as a plain object", async () => {
    const onIntent = vi.fn();
    app({ keymap: { keys: { w: "moveUp" } } }, () => [node("scope", Scope, { onIntent })]);
    await settle();

    press("w");

    expect(onIntent).toHaveBeenCalledWith("moveUp");
  });
});

describe("provideNav", () => {
  it("renders once with no system, then builds one on mount and hands it down", async () => {
    const { container } = app(undefined, () => [node("scope", Scope, { onIntent: () => {} })]);
    const ready = (): string | null | undefined =>
      container.querySelector('[data-testid="ready"]')?.textContent;

    expect(ready()).toBe("no");
    await settle();
    expect(ready()).toBe("yes");
  });

  it("turns a key into the intent a scope receives", async () => {
    const onIntent = vi.fn();
    app(undefined, () => [node("scope", Scope, { onIntent })]);
    await settle();

    press();

    expect(onIntent).toHaveBeenCalledWith("moveDown");
  });

  it("warns about a missing provider, and only once the component mounts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const inside = app(undefined, () => [node("scope", Scope, { onIntent: () => {} })]);
      await settle();
      expect(warn).not.toHaveBeenCalled();
      inside.unmount();

      mount(Tree, { nodes: () => [node("scope", Scope, { onIntent: () => {} })] });
      expect(warn).not.toHaveBeenCalled();
      await settle();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("destroys the system on unmount", async () => {
    const onIntent = vi.fn();
    const handle = app(undefined, () => [node("scope", Scope, { onIntent })]);
    await settle();
    handle.unmount();

    press();

    expect(onIntent).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute("data-snav-input")).toBe(false);
  });
});

describe("useInputModality", () => {
  it("follows the document's modality without needing a provider", async () => {
    const { container } = mount(Tree, { nodes: () => [node("probe", Probe)] });
    await settle();
    const read = (): string =>
      container.querySelector('[data-testid="modality"]')?.textContent ?? "";

    document.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
    );
    await settle();
    expect(read()).toBe("pointer");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await settle();
    expect(read()).toBe("keyboard");
  });
});

describe("provideNavDocument", () => {
  it("builds the system on the document it is given, and not on the page's", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    if (frameDocument === null) throw new Error("no frame document");
    const onIntent = vi.fn();
    try {
      app(undefined, () => [node("scope", Scope, { onIntent })], { doc: () => frameDocument });
      await settle();

      press();
      expect(onIntent).not.toHaveBeenCalled();

      frameDocument.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
      expect(onIntent).toHaveBeenCalledWith("moveDown");
    } finally {
      unmountAll();
      frame.remove();
    }
  });

  it("warns when it comes after provideNav in the same component, and only then", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mount(Order, { order: "document first" });
      app(undefined, () => [node("child", Order, { order: "document only" })]);
      await settle();
      expect(warn).not.toHaveBeenCalled();

      mount(Order, { order: "provider first" });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

/**
 * A scope host is what a machine is handed, and a machine opens its scopes whenever its
 * state changes. Each handler here records its name and declines, so the list is the
 * order of the stack down to the first trap.
 */
describe("useIntentScopeHost, and scope order across a rebuild", () => {
  const REMAPPED: KeymapOverrides = { keys: { w: "moveUp" } };

  it("answers a scope opened while the component initialises, before the system exists", async () => {
    const { seen, handler } = recorder();
    const atInit: unknown[] = [];

    app(undefined, () => [node("machine", Machine, { handler: handler("machine"), atInit })]);
    await settle();
    press();

    expect(atInit[0]).not.toBeNull();
    expect(atInit[1]).toBeNull();
    expect(seen).toEqual(["machine"]);
  });

  it("answers null without a provider, and hands one host to a provider's tree across a rebuild", async () => {
    const hosts: (IntentScopeHost | null)[] = [];

    mount(Tree, { nodes: () => [node("reader", Reader, { hosts })] });
    expect(hosts).toEqual([null]);
    unmountAll();
    hosts.length = 0;

    const keymap = state<KeymapOverrides | undefined>(undefined);
    const shown = state(false);
    app(
      () => ({ keymap: keymap.current }),
      () => [
        node("first", Reader, { hosts }),
        ...(shown.current ? [node("second", Reader, { hosts })] : []),
      ],
    );
    await settle();
    keymap.current = REMAPPED;
    shown.current = true;
    await settle();

    expect(hosts).toHaveLength(2);
    expect(hosts[0]).not.toBeNull();
    expect(hosts[1]).toBe(hosts[0]);
  });

  it("keeps sibling host scopes in the order they were opened", async () => {
    const { seen, handler } = recorder();
    const { all, seen: onSystem } = systems();
    const aOpen = state(false);
    const keymap = state<KeymapOverrides | undefined>(undefined);
    // "a" is declared first, opened second and traps: issue #13's own probe.
    app(
      () => ({ keymap: keymap.current }),
      () => [
        node("probe", Probe, { onSystem }),
        node("a", HostScope, { name: "a", open: aOpen.current, trapped: true, onIntent: handler }),
        node("b", HostScope, { name: "b", open: true, onIntent: handler }),
      ],
    );
    await settle();
    aOpen.current = true;
    await settle();
    press();
    expect(seen).toEqual(["a"]);

    keymap.current = REMAPPED;
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["a", "a"]);
  });

  it("keeps a host trap above a hook scope opened before it", async () => {
    const { seen, handler } = recorder();
    const { all, seen: onSystem } = systems();
    const open = state(false);
    const keymap = state<KeymapOverrides | undefined>(undefined);
    app(
      () => ({ keymap: keymap.current }),
      () => [
        node("probe", Probe, { onSystem }),
        node("dialog", HostScope, {
          name: "dialog",
          open: open.current,
          trapped: true,
          onIntent: handler,
        }),
        node("composite", HookScope, { name: "composite", onIntent: handler }),
      ],
    );
    await settle();
    open.current = true;
    await settle();
    press();
    expect(seen).toEqual(["dialog"]);

    keymap.current = REMAPPED;
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["dialog", "dialog"]);
  });

  it("keeps a nested composite under the trap of the dialog around it", async () => {
    const { seen, handler } = recorder();
    const { all, seen: onSystem } = systems();
    const open = state(false);
    const keymap = state<KeymapOverrides | undefined>(undefined);
    app(
      () => ({ keymap: keymap.current }),
      () => [
        node("probe", Probe, { onSystem }),
        node("dialog", HostScope, {
          name: "dialog",
          open: open.current,
          trapped: true,
          onIntent: handler,
        }),
        node("composite", HookScope, { name: "composite", onIntent: handler }, () => [
          node("item", HookScope, { name: "item", onIntent: handler }),
        ]),
      ],
    );
    await settle();
    press();
    // A child is mounted before its parent, so "item" was opened first.
    expect(seen).toEqual(["composite", "item"]);
    seen.length = 0;

    open.current = true;
    await settle();
    press();
    expect(seen).toEqual(["dialog"]);

    keymap.current = REMAPPED;
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["dialog", "dialog"]);
  });

  it("keeps a hook scope opened over a host trap above that trap", async () => {
    const { seen, handler } = recorder();
    const { all, seen: onSystem } = systems();
    const menu = state(false);
    const keymap = state<KeymapOverrides | undefined>(undefined);
    app(
      () => ({ keymap: keymap.current }),
      () => [
        node("probe", Probe, { onSystem }),
        ...(menu.current ? [node("menu", HookScope, { name: "menu", onIntent: handler })] : []),
        node("dialog", HostScope, { name: "dialog", open: true, trapped: true, onIntent: handler }),
      ],
    );
    await settle();
    menu.current = true;
    await settle();
    press();
    expect(seen).toEqual(["menu", "dialog"]);

    keymap.current = REMAPPED;
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["menu", "dialog", "menu", "dialog"]);
  });

  it("re-opens a scope in its place when a getter it was given for trapped changes", async () => {
    const { seen, handler } = recorder();
    const trapped = state(false);
    app(undefined, () => [
      node("below", HookScope, { name: "below", onIntent: handler }),
      node("page", Page, { handler: handler("page"), trapped: trapped.current }),
      node("above", HookScope, { name: "above", onIntent: handler }),
    ]);
    await settle();
    press();
    expect(seen).toEqual(["above", "page", "below"]);
    seen.length = 0;

    trapped.current = true;
    await settle();
    press();

    // The trap took effect, since "below" is silenced, and "page" is still beneath "above":
    // a re-push of the one scope would have lifted it on top and silenced "above" too.
    expect(seen).toEqual(["above", "page"]);
  });

  it("releases every scope when the components unmount, the provider still up", async () => {
    const { seen, handler } = recorder();
    const shown = state(true);
    app(undefined, () =>
      shown.current
        ? [
            node("host", HostScope, { name: "host", open: true, onIntent: handler }),
            node("hook", HookScope, { name: "hook", onIntent: handler }),
          ]
        : [],
    );
    await settle();
    press();
    expect(seen).toEqual(["hook", "host"]);

    shown.current = false;
    await settle();
    press();

    expect(seen).toEqual(["hook", "host"]);
  });

  it("lets a host scope be disposed after the provider is gone", async () => {
    const { handler } = recorder();
    let dispose: VoidFunction | undefined;
    const handle = app(undefined, () => [
      node("leaky", Leaky, {
        handler: handler("leaky"),
        keep: (kept: VoidFunction | undefined) => {
          dispose = kept;
        },
      }),
    ]);
    await settle();
    handle.unmount();

    expect(dispose).toBeTypeOf("function");
    expect(() => dispose?.()).not.toThrow();
    expect(() => dispose?.()).not.toThrow();
  });
});

describe("useIntent — a composite inside a trapping dialog (ADR-0025)", () => {
  function checked(): string | undefined {
    return document.querySelector<HTMLInputElement>("input[name=level]:checked")?.value;
  }

  function dialog(
    within: "getter" | "none",
    onClose: VoidFunction,
    surface?: Element,
  ): () => readonly TreeNode[] {
    const open = state(true);
    return () =>
      open.current
        ? [
            node(
              "dialog",
              Dialog,
              {
                surface,
                onClose: () => {
                  onClose();
                  open.current = false;
                },
              },
              () => [node("group", RadioGroup, { within })],
            ),
          ]
        : [];
  }

  const plugins = [spatialPlugin({ mode: "app" })];

  it("moves a radio group mounted with its dialog, its within a getter over bind:this", async () => {
    const onClose = vi.fn();
    app({ plugins }, dialog("getter", onClose));
    await settle();

    press("ArrowDown");
    await settle();
    expect(checked()).toBe("medium");

    // `back` still escapes the trap and reaches the dialog.
    press("Escape");
    await settle();
    expect(onClose).toHaveBeenCalledOnce();
    expect(checked()).toBeUndefined();
  });

  it("moves the radio group when the dialog's within is an element that existed before init", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    mount(App, { options: { plugins }, nodes: dialog("getter", () => {}, container) }, container);
    await settle();

    press("ArrowDown");
    await settle();

    expect(checked()).toBe("medium");
  });

  it("keeps a radio group that names no element silenced, as before", async () => {
    app(
      { plugins },
      dialog("none", () => {}),
    );
    await settle();

    press("ArrowDown");
    await settle();

    expect(checked()).toBe("low");
  });

  it("does not open the scope again when its bound element fills or the component re-renders", async () => {
    let system: InputSystem | null = null;
    const tick = state(0);
    app(undefined, () => [
      node("probe", Probe, {
        onSystem: (seen: InputSystem | null) => {
          system = seen;
        },
      }),
      node("composite", Composite, { tick: tick.current }),
    ]);
    await settle();
    const built = system as InputSystem | null;
    if (built === null) throw new Error("no system");
    const pushScope = vi.spyOn(built, "pushScope");

    tick.current = 1;
    await settle();
    tick.current = 2;
    await settle();

    expect(document.querySelector("[data-tick]")?.getAttribute("data-tick")).toBe("2");
    expect(pushScope).not.toHaveBeenCalled();
  });
});

describe("the native answer through the adapter (ADR-0026)", () => {
  function checked(): string | undefined {
    return document.querySelector<HTMLInputElement>("input[name=size]:checked")?.value;
  }

  const plugins = [spatialPlugin({ mode: "app" })];

  it("lets a real ArrowDown check the next radio through useIntent", async () => {
    app({ plugins }, () => [node("sizes", Sizes), node("after", Button, { label: "after" })]);
    await settle();
    document.querySelector<HTMLInputElement>("input[value=s]")?.focus();

    await userEvent.keyboard("{ArrowDown}");

    expect(checked()).toBe("m");
    expect((document.activeElement as HTMLInputElement | null)?.value).toBe("m");
  });

  it("hands a host scope's native answer back unchanged", async () => {
    let host: IntentScopeHost | null = null;
    app({ plugins }, () => [
      node("probe", Probe, {
        onHost: (seen: IntentScopeHost | null) => {
          host = seen;
        },
      }),
      node("first", Button, { id: "first", label: "first" }),
      node("second", Button, { id: "second", label: "second" }),
    ]);
    await settle();
    const opened = host as IntentScopeHost | null;
    if (opened === null) throw new Error("no host");
    const dispose = opened.pushScope(() => "native");
    document.querySelector<HTMLElement>("#first")?.focus();

    // The two buttons sit side by side, so without the answer the engine would move right.
    const event = press("ArrowRight");
    dispose();

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement?.id).toBe("first");
  });
});

/**
 * ADR-0022 decision 5 names the risk for every framework that tracks a field's value: the
 * on-screen keyboard mutates the field and then fires `input`. Svelte's `bind:value` on a
 * text field is an `input` listener that reads `value` back.
 */
describe("the on-screen keyboard against bind:value", () => {
  for (const type of ["text", "email"] as const) {
    it(`reaches the bound value of a ${type} field`, async () => {
      let model: string | undefined;
      const keyboard = keyboardPlugin({ layout: alphabetic, openOn: "focus" });
      const handle = app({ plugins: [keyboard] }, () => [
        node("field", Field, {
          type,
          onModel: (value: string) => {
            model = value;
          },
        }),
      ]);
      await settle();
      const field = handle.container.querySelector("input");
      if (field === null) throw new Error("no field");
      field.focus();
      await settle();

      const key = document.querySelector<HTMLButtonElement>("[data-snav-keyboard] button");
      if (key === null) throw new Error("the keyboard did not open");
      key.click();
      await settle();

      expect({ dom: field.value, model }).toEqual({ dom: "a", model: "a" });
    });
  }
});

/**
 * Svelte passes the same gate as React and Vue. The tree's shape is one piece of state read
 * by the root component, so `update` is an assignment and nothing is remounted.
 */
const parity = (() => {
  let handle: Mounted | null = null;
  const shape = state<ParityTree>({});

  return {
    name: "svelte",
    mount(tree?: ParityTree | undefined): ParityProbe {
      const intents: string[] = [];
      const released: string[] = [];
      const renders: (InputSystem | null)[] = [];
      let system: InputSystem | null = null;
      let modality: (() => InputModality) | null = null;
      shape.current = tree ?? {};

      handle = mount(ParityTreeComponent, {
        shape: () => shape.current,
        // One plugin for the life of the mount, so that only `keymap` rebuilds the system.
        plugins: [spatialPlugin()],
        intents,
        released,
        onSystem: (seen: InputSystem | null) => {
          system = seen;
          renders.push(seen);
        },
        onModality: (read: () => InputModality) => {
          modality = read;
        },
      });

      return {
        system: () => system,
        renders: () => renders,
        modality: () => modality?.() ?? "pointer",
        intents: () => intents,
        released: () => released,
      };
    },
    update(tree: ParityTree): void {
      shape.current = tree;
    },
    unmount(): void {
      handle?.unmount();
      handle = null;
    },
    settle,
    act(action: VoidFunction): void {
      flushSync(action);
    },
  };
})();

runAdapterParitySuite(parity);
