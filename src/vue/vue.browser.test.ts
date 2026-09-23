import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  type Component,
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  type PropType,
  type ShallowRef,
  shallowRef,
  toValue,
  type VNodeChild,
  watch,
} from "vue";
import { type ParityProbe, type ParityTree, runAdapterParitySuite } from "../adapter-parity";
import type { IntentHandler } from "../intent-bus";
import { keyboardPlugin } from "../keyboard/keyboard";
import { alphabetic } from "../keyboard/layouts/alphabetic";
import { spatialPlugin } from "../spatial/spatial";
import type { InputModality } from "../types";
import {
  type InputSystem,
  type IntentScopeHost,
  NavDocumentProvider,
  NavProvider,
  useInputModality,
  useInputSystem,
  useIntent,
  useIntentScopeHost,
} from "./vue";
import { mount, settle, takeWarnings, unmountAll } from "./vue-harness";

afterEach(() => {
  unmountAll();
  document.body.querySelector("#parity-host")?.remove();
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

/** Records every distinct system its provider hands down, in the order they came. */
function systems(): { readonly Probe: Component; readonly all: unknown[] } {
  const all: unknown[] = [];
  const Probe = defineComponent(() => {
    const system = useInputSystem();
    return () => {
      if (system.value !== null && !all.includes(system.value)) all.push(system.value);
      return null;
    };
  });
  return { Probe, all };
}

const Scope = defineComponent<{ readonly onIntent: (intent: string) => void }>(
  (props) => {
    const system = useInputSystem();
    useIntent((event) => {
      props.onIntent(event.intent);
      return true;
    });
    return () => h("span", { "data-testid": "ready" }, system.value === null ? "no" : "yes");
  },
  { props: { onIntent: { type: Function as PropType<(intent: string) => void>, required: true } } },
);

describe("NavProvider — what does and does not rebuild the system", () => {
  it("keeps the system when the plugins arrive in a fresh array around the same instances", async () => {
    const plugins = [spatialPlugin()];
    const { Probe, all } = systems();
    const tick = shallowRef(0);
    mount(() => [h("i", tick.value), h(NavProvider, { plugins: [...plugins] }, () => h(Probe))]);
    await settle();
    tick.value = 1;
    await settle();

    expect(all).toHaveLength(1);
  });

  it("keeps the system when the keymap is a fresh literal with the same keys", async () => {
    const { Probe, all } = systems();
    const tick = shallowRef(0);
    mount(() => [
      h("i", tick.value),
      h(NavProvider, { keymap: { keys: { w: "moveUp" } } }, () => h(Probe)),
    ]);
    await settle();
    tick.value = 1;
    await settle();

    expect(all).toHaveLength(1);
  });

  it("rebuilds when the plugins themselves are built in the render function", async () => {
    const { Probe, all } = systems();
    const tick = shallowRef(0);
    // A new plugin object per render: the contents changed, so the system is rebuilt.
    // Kept to make the cost visible, not to bless it.
    mount(() => [
      h("i", tick.value),
      h(NavProvider, { plugins: [spatialPlugin()] }, () => h(Probe)),
    ]);
    await settle();
    tick.value = 1;
    await settle();

    expect(all).toHaveLength(2);
  });
});

describe("NavProvider", () => {
  it("renders once with no system, then builds one on mount and hands it down", async () => {
    const { container } = mount(() => h(NavProvider, null, () => h(Scope, { onIntent: () => {} })));
    const ready = (): string | null | undefined =>
      container.querySelector('[data-testid="ready"]')?.textContent;

    expect(ready()).toBe("no");
    await settle();
    expect(ready()).toBe("yes");
  });

  it("turns a key into the intent a scope receives", async () => {
    const onIntent = vi.fn();
    mount(() => h(NavProvider, null, () => h(Scope, { onIntent })));
    await settle();

    press();

    expect(onIntent).toHaveBeenCalledWith("moveDown");
  });

  it("warns about a missing provider, and not about a system still being built", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const inside = mount(() => h(NavProvider, null, () => h(Scope, { onIntent: () => {} })));
      await settle();
      expect(warn).not.toHaveBeenCalled();
      inside.unmount();

      mount(() => h(Scope, { onIntent: () => {} }));
      await settle();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("destroys the system on unmount", async () => {
    const onIntent = vi.fn();
    const handle = mount(() => h(NavProvider, null, () => h(Scope, { onIntent })));
    await settle();
    handle.unmount();

    press();

    expect(onIntent).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute("data-snav-input")).toBe(false);
  });
});

describe("useInputModality", () => {
  it("follows the document's modality without needing a provider", async () => {
    const Probe = defineComponent(() => {
      const modality = useInputModality();
      return () => h("span", { "data-testid": "modality" }, modality.value);
    });
    const { container } = mount(() => h(Probe));
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

describe("NavDocumentProvider", () => {
  it("builds the system on the document it is given, and not on the page's", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    if (frameDocument === null) throw new Error("no frame document");
    const onIntent = vi.fn();
    try {
      mount(() =>
        h(NavDocumentProvider, { doc: () => frameDocument }, () =>
          h(NavProvider, null, () => h(Scope, { onIntent })),
        ),
      );
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
});

/**
 * A scope host is what a machine is handed, and a machine opens its scopes whenever its
 * state changes. Each handler here records its name and declines, so the list is the
 * order of the stack down to the first trap.
 */
describe("useIntentScopeHost, and scope order across a rebuild", () => {
  const REMAPPED = { keys: { w: "moveUp" as const } };

  /** Opens a scope through the host whenever `open` turns true, the way a machine does. */
  const HostScope = defineComponent<{
    readonly name: string;
    readonly open: boolean;
    readonly trapped?: boolean | undefined;
    readonly onIntent: (name: string) => IntentHandler;
  }>(
    (props) => {
      const host = useIntentScopeHost();
      watch(
        () => props.open,
        (open, _previous, onCleanup) => {
          if (!open || host === null) return;
          onCleanup(host.pushScope(props.onIntent(props.name), { trapped: props.trapped }));
        },
        { immediate: true },
      );
      return () => null;
    },
    {
      props: {
        name: { type: String, required: true },
        open: { type: Boolean, required: true },
        trapped: Boolean,
        onIntent: { type: Function as PropType<(name: string) => IntentHandler>, required: true },
      },
    },
  );

  const HookScope = defineComponent<{
    readonly name: string;
    readonly onIntent: (name: string) => IntentHandler;
  }>(
    (props, { slots }) => {
      useIntent(props.onIntent(props.name));
      return () => slots.default?.();
    },
    {
      props: {
        name: { type: String, required: true },
        onIntent: { type: Function as PropType<(name: string) => IntentHandler>, required: true },
      },
    },
  );

  it("answers a scope opened during setup, before the system exists", async () => {
    const { seen, handler } = recorder();
    const atSetup: unknown[] = [];
    const Machine = defineComponent(() => {
      const host = useIntentScopeHost();
      const system = useInputSystem();
      atSetup.push(host, system.value);
      host?.pushScope(handler("machine"));
      return () => null;
    });

    mount(() => h(NavProvider, null, () => h(Machine)));
    await settle();
    press();

    expect(atSetup[0]).not.toBeNull();
    expect(atSetup[1]).toBeNull();
    expect(seen).toEqual(["machine"]);
  });

  it("answers null without a provider, and hands one host to a provider's tree across a rebuild", async () => {
    const hosts: (IntentScopeHost | null)[] = [];
    const Reader = defineComponent(() => {
      hosts.push(useIntentScopeHost());
      return () => null;
    });

    mount(() => h(Reader));
    expect(hosts).toEqual([null]);
    unmountAll();
    hosts.length = 0;

    const keymap = shallowRef<typeof REMAPPED | undefined>(undefined);
    const shown = shallowRef(false);
    mount(() =>
      h(NavProvider, { keymap: keymap.value }, () => [h(Reader), shown.value ? h(Reader) : null]),
    );
    await settle();
    keymap.value = REMAPPED;
    shown.value = true;
    await settle();

    expect(hosts).toHaveLength(2);
    expect(hosts[0]).not.toBeNull();
    expect(hosts[1]).toBe(hosts[0]);
  });

  it("keeps sibling host scopes in the order they were opened", async () => {
    const { seen, handler } = recorder();
    const { Probe, all } = systems();
    const aOpen = shallowRef(false);
    const keymap = shallowRef<typeof REMAPPED | undefined>(undefined);
    // "a" is declared first, opened second and traps: issue #13's own probe.
    mount(() =>
      h(NavProvider, { keymap: keymap.value }, () => [
        h(Probe),
        h(HostScope, { name: "a", open: aOpen.value, trapped: true, onIntent: handler }),
        h(HostScope, { name: "b", open: true, onIntent: handler }),
      ]),
    );
    await settle();
    aOpen.value = true;
    await settle();
    press();
    expect(seen).toEqual(["a"]);

    keymap.value = REMAPPED;
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["a", "a"]);
  });

  it("keeps a host trap above a hook scope opened before it", async () => {
    const { seen, handler } = recorder();
    const { Probe, all } = systems();
    const open = shallowRef(false);
    const keymap = shallowRef<typeof REMAPPED | undefined>(undefined);
    mount(() =>
      h(NavProvider, { keymap: keymap.value }, () => [
        h(Probe),
        h(HostScope, { name: "dialog", open: open.value, trapped: true, onIntent: handler }),
        h(HookScope, { name: "composite", onIntent: handler }),
      ]),
    );
    await settle();
    open.value = true;
    await settle();
    press();
    expect(seen).toEqual(["dialog"]);

    keymap.value = REMAPPED;
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["dialog", "dialog"]);
  });

  it("keeps a nested composite under the trap of the dialog around it", async () => {
    const { seen, handler } = recorder();
    const { Probe, all } = systems();
    const open = shallowRef(false);
    const keymap = shallowRef<typeof REMAPPED | undefined>(undefined);
    mount(() =>
      h(NavProvider, { keymap: keymap.value }, () => [
        h(Probe),
        h(HostScope, { name: "dialog", open: open.value, trapped: true, onIntent: handler }),
        h(HookScope, { name: "composite", onIntent: handler }, () =>
          h(HookScope, { name: "item", onIntent: handler }),
        ),
      ]),
    );
    await settle();
    press();
    // A child is mounted before its parent, so "item" was opened first.
    expect(seen).toEqual(["composite", "item"]);
    seen.length = 0;

    open.value = true;
    await settle();
    press();
    expect(seen).toEqual(["dialog"]);

    keymap.value = REMAPPED;
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["dialog", "dialog"]);
  });

  it("keeps a hook scope opened over a host trap above that trap", async () => {
    const { seen, handler } = recorder();
    const { Probe, all } = systems();
    const menu = shallowRef(false);
    const keymap = shallowRef<typeof REMAPPED | undefined>(undefined);
    mount(() =>
      h(NavProvider, { keymap: keymap.value }, () => [
        h(Probe),
        menu.value ? h(HookScope, { name: "menu", onIntent: handler }) : null,
        h(HostScope, { name: "dialog", open: true, trapped: true, onIntent: handler }),
      ]),
    );
    await settle();
    menu.value = true;
    await settle();
    press();
    expect(seen).toEqual(["menu", "dialog"]);

    keymap.value = REMAPPED;
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["menu", "dialog", "menu", "dialog"]);
  });

  it("re-opens a scope in its place when a ref it was given for trapped changes", async () => {
    const { seen, handler } = recorder();
    const trapped = shallowRef(false);
    const Page = defineComponent(() => {
      useIntent(handler("page"), { trapped });
      return () => null;
    });
    mount(() =>
      h(NavProvider, null, () => [
        h(HookScope, { name: "below", onIntent: handler }),
        h(Page),
        h(HookScope, { name: "above", onIntent: handler }),
      ]),
    );
    await settle();
    press();
    expect(seen).toEqual(["above", "page", "below"]);
    seen.length = 0;

    trapped.value = true;
    await settle();
    press();

    // The trap took effect, since "below" is silenced, and "page" is still beneath "above":
    // a re-push of the one scope would have lifted it on top and silenced "above" too.
    expect(seen).toEqual(["above", "page"]);
  });

  it("releases every scope when the components unmount, the provider still up", async () => {
    const { seen, handler } = recorder();
    const shown = shallowRef(true);
    mount(() =>
      h(NavProvider, null, () =>
        shown.value
          ? [
              h(HostScope, { name: "host", open: true, onIntent: handler }),
              h(HookScope, { name: "hook", onIntent: handler }),
            ]
          : [],
      ),
    );
    await settle();
    press();
    expect(seen).toEqual(["hook", "host"]);

    shown.value = false;
    await settle();
    press();

    expect(seen).toEqual(["hook", "host"]);
  });

  it("lets a host scope be disposed after the provider is gone", async () => {
    const { handler } = recorder();
    let dispose: VoidFunction | undefined;
    const Leaky = defineComponent(() => {
      const host = useIntentScopeHost();
      onMounted(() => {
        dispose = host?.pushScope(handler("leaky"));
      });
      return () => null;
    });
    const handle = mount(() => h(NavProvider, null, () => h(Leaky)));
    await settle();
    handle.unmount();

    expect(() => dispose?.()).not.toThrow();
    expect(() => dispose?.()).not.toThrow();
  });
});

describe("useIntent — a composite inside a trapping dialog (ADR-0025)", () => {
  const CHOICES = ["low", "medium", "high"] as const;

  function checked(): string | undefined {
    return document.querySelector<HTMLInputElement>("input[name=level]:checked")?.value;
  }

  type Within = "template ref" | "getter" | "none";

  // The recipe of docs/en/vue.md: the dialog traps and names its surface.
  const Dialog = defineComponent<{
    readonly onClose: VoidFunction;
    readonly surface?: Element | undefined;
  }>(
    (props, { slots }) => {
      const surface = shallowRef<HTMLElement | null>(null);
      useIntent(
        (event) => {
          if (event.intent !== "back") return false;
          props.onClose();
          return true;
        },
        { trapped: true, within: props.surface ?? surface },
      );
      return () =>
        h(
          "div",
          { ref: surface, "data-snav": "container", "data-snav-trap": "" },
          slots.default?.(),
        );
    },
    {
      props: {
        onClose: { type: Function as PropType<VoidFunction>, required: true },
        surface: Object as PropType<Element>,
      },
    },
  );

  const RadioGroup = defineComponent<{ readonly within: Within }>(
    (props) => {
      const group = shallowRef<HTMLElement | null>(null);
      const at = shallowRef(0);
      useIntent(
        (event) => {
          if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
          const step = event.intent === "moveDown" ? 1 : -1;
          at.value = Math.max(0, Math.min(CHOICES.length - 1, at.value + step));
          return true;
        },
        {
          within:
            props.within === "template ref"
              ? group
              : props.within === "getter"
                ? () => group.value
                : undefined,
        },
      );
      return () =>
        h(
          "div",
          { role: "radiogroup", ref: group },
          CHOICES.map((choice, index) =>
            h("label", { key: choice }, [
              h("input", {
                type: "radio",
                name: "level",
                value: choice,
                checked: index === at.value,
              }),
              choice,
            ]),
          ),
        );
    },
    { props: { within: { type: String as PropType<Within>, required: true } } },
  );

  function app(within: Within, onClose: VoidFunction, surface?: Element): () => VNodeChild {
    const open = shallowRef(true);
    const plugins = [spatialPlugin({ mode: "app" })];
    return () =>
      h(NavProvider, { plugins }, () =>
        open.value
          ? h(
              Dialog,
              {
                surface,
                onClose: () => {
                  onClose();
                  open.value = false;
                },
              },
              () => h(RadioGroup, { within }),
            )
          : null,
      );
  }

  for (const within of ["template ref", "getter"] as const) {
    it(`moves a radio group mounted with its dialog, its within given as a ${within}`, async () => {
      const onClose = vi.fn();
      mount(app(within, onClose));
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
  }

  it("moves the radio group when the dialog's within is an element that existed before setup", async () => {
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    mount(app("template ref", onClose, container), container);
    await settle();

    press("ArrowDown");
    await settle();

    expect(checked()).toBe("medium");
  });

  it("keeps a radio group that names no element silenced, as before", async () => {
    mount(app("none", () => {}));
    await settle();

    press("ArrowDown");
    await settle();

    expect(checked()).toBe("low");
  });

  it("does not open the scope again when its within ref fills or the component re-renders", async () => {
    let system: InputSystem | null = null;
    const Probe = defineComponent(() => {
      const current = useInputSystem();
      return () => {
        system = current.value;
        return null;
      };
    });
    const Composite = defineComponent<{ readonly tick: number }>(
      (props) => {
        const group = shallowRef<HTMLElement | null>(null);
        useIntent(() => false, { within: group });
        return () => h("div", { ref: group, "data-tick": props.tick });
      },
      { props: { tick: { type: Number, required: true } } },
    );
    const tick = shallowRef(0);
    mount(() => h(NavProvider, null, () => [h(Probe), h(Composite, { tick: tick.value })]));
    await settle();
    const built = system as InputSystem | null;
    if (built === null) throw new Error("no system");
    const pushScope = vi.spyOn(built, "pushScope");

    tick.value = 1;
    await settle();
    tick.value = 2;
    await settle();

    expect(pushScope).not.toHaveBeenCalled();
  });
});

describe("the native answer through the adapter (ADR-0026)", () => {
  function checked(): string | undefined {
    return document.querySelector<HTMLInputElement>("input[name=size]:checked")?.value;
  }

  // The recipe of docs/en/vue.md: native radios in app mode keep their own axis.
  const Sizes = defineComponent(() => {
    const group = shallowRef<HTMLElement | null>(null);
    useIntent(
      (event) =>
        event.source === "keyboard" &&
        (event.intent === "moveUp" || event.intent === "moveDown") &&
        group.value?.contains(document.activeElement) === true
          ? "native"
          : false,
      { within: group },
    );
    return () =>
      h(
        "div",
        { role: "radiogroup", ref: group },
        ["s", "m", "l"].map((size) =>
          h("label", { key: size, style: { display: "block" } }, [
            h("input", { type: "radio", name: "size", value: size, checked: size === "s" }),
            size,
          ]),
        ),
      );
  });

  it("lets a real ArrowDown check the next radio through useIntent", async () => {
    const plugins = [spatialPlugin({ mode: "app" })];
    mount(() =>
      h(NavProvider, { plugins }, () => [h(Sizes), h("button", { type: "button" }, "after")]),
    );
    await settle();
    document.querySelector<HTMLInputElement>("input[value=s]")?.focus();

    await userEvent.keyboard("{ArrowDown}");

    expect(checked()).toBe("m");
    expect((document.activeElement as HTMLInputElement | null)?.value).toBe("m");
  });

  it("hands a host scope's native answer back unchanged", async () => {
    let host: IntentScopeHost | null = null;
    const Probe = defineComponent(() => {
      host = useIntentScopeHost();
      return () => null;
    });
    const plugins = [spatialPlugin({ mode: "app" })];
    mount(() =>
      h(NavProvider, { plugins }, () => [
        h(Probe),
        h("button", { type: "button", id: "first" }, "first"),
        h("button", { type: "button", id: "second" }, "second"),
      ]),
    );
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
 * on-screen keyboard mutates the field and then fires `input`. Vue's `v-model` on a text
 * field is an `input` listener that reads `value` back, which is what these bind by hand.
 */
describe("the on-screen keyboard against a v-model", () => {
  for (const type of ["text", "email"] as const) {
    it(`reaches the model of a ${type} field`, async () => {
      const text = shallowRef("");
      const keyboard = keyboardPlugin({ layout: alphabetic, openOn: "focus" });
      const handle = mount(() =>
        h(NavProvider, { plugins: [keyboard] }, () =>
          h("input", {
            type,
            value: text.value,
            onInput: (event: Event) => {
              text.value = (event.target as HTMLInputElement).value;
            },
          }),
        ),
      );
      await settle();
      const field = handle.container.querySelector("input");
      if (field === null) throw new Error("no field");
      field.focus();
      await settle();

      const key = document.querySelector<HTMLButtonElement>("[data-snav-keyboard] button");
      if (key === null) throw new Error("the keyboard did not open");
      key.click();
      await settle();

      expect({ dom: field.value, model: text.value }).toEqual({ dom: "a", model: "a" });
    });
  }
});

/**
 * Vue passes the same gate as React. The tree is one reactive shape read by the root's
 * render function, so `update` is an assignment and nothing is remounted.
 */
const parity = (() => {
  let handle: ReturnType<typeof mount> | null = null;
  const shape = shallowRef<ParityTree>({});

  return {
    name: "vue",
    mount(tree?: ParityTree | undefined): ParityProbe {
      const intents: string[] = [];
      const released: string[] = [];
      const renders: (InputSystem | null)[] = [];
      let system: InputSystem | null = null;
      let modality: Readonly<ShallowRef<InputModality>> | null = null;

      // Both scopes decline, so both are asked and the order of the list is the order of
      // the stack. `trapped` is what stops the walk, not a `true` return.
      const Named = defineComponent<{
        readonly name: string;
        readonly trapped?: boolean | undefined;
        readonly base?: boolean | undefined;
        readonly within?: Readonly<ShallowRef<HTMLElement | null>> | undefined;
      }>(
        (props, { slots }) => {
          useIntent(
            (event) => {
              intents.push(`${props.name}:${event.intent}`);
              return false;
            },
            {
              trapped: () => props.trapped,
              base: () => props.base,
              within: () => toValue(props.within),
            },
          );
          onUnmounted(() => released.push(props.name));
          return () => slots.default?.();
        },
        {
          props: {
            name: { type: String, required: true },
            trapped: Boolean,
            base: Boolean,
            within: Object,
          },
        },
      );

      const Probe = defineComponent(() => {
        const current = useInputSystem();
        modality = useInputModality();
        return () => {
          system = current.value;
          renders.push(current.value);
          return null;
        };
      });

      // One plugin for the life of the mount, so that only `keymap` rebuilds the system.
      const plugins = [spatialPlugin()];
      // The elements belong to the tree rather than to the scope components, so they stay
      // nested when the components are siblings, and a template ref is what `within` gets.
      const outerElement = shallowRef<HTMLElement | null>(null);
      const innerElement = shallowRef<HTMLElement | null>(null);
      shape.value = tree ?? {};

      handle = mount(() => {
        const next = shape.value;
        const inner =
          (next.inner ?? true)
            ? h(Named, {
                name: "inner",
                trapped: next.trapped ?? false,
                within: next.within ? innerElement : undefined,
              })
            : null;
        return h(NavProvider, { plugins, keymap: next.keymap }, () => [
          h(Probe),
          h("div", { "data-parity": "outer", ref: outerElement }, [
            h("div", { "data-parity": "inner", ref: innerElement }),
          ]),
          (next.outer ?? true)
            ? h(
                Named,
                {
                  name: "outer",
                  base: next.base ?? false,
                  trapped: next.outerTrapped ?? false,
                  within: next.within ? outerElement : undefined,
                },
                () => (next.nested ? [inner] : []),
              )
            : null,
          next.nested ? null : inner,
        ]);
      });

      return {
        system: () => system,
        renders: () => renders,
        modality: () => modality?.value ?? "pointer",
        intents: () => intents,
        released: () => released,
      };
    },
    update(tree: ParityTree): void {
      shape.value = tree;
    },
    unmount(): void {
      handle?.unmount();
      handle = null;
    },
    async settle(): Promise<void> {
      await settle();
    },
    act(action: VoidFunction): void {
      action();
    },
  };
})();

runAdapterParitySuite(parity);
