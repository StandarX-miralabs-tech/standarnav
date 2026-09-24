import "@angular/compiler";
import {
  afterNextRender,
  createEnvironmentInjector,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  type Signal,
  signal,
  type Type,
} from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { type ParityProbe, type ParityTree, runAdapterParitySuite } from "../adapter-parity";
import { keyboardPlugin } from "../keyboard/keyboard";
import { alphabetic } from "../keyboard/layouts/alphabetic";
import { spatialPlugin } from "../spatial/spatial";
import {
  type InjectIntentOptions,
  type InputModality,
  type InputSystem,
  type IntentHandler,
  type IntentScopeHost,
  injectInputModality,
  injectInputSystem,
  injectIntent,
  injectIntentScopeHost,
  type KeymapOverrides,
  type NavOptions,
  provideNav,
  provideNavDocument,
} from "./angular";
import {
  bootstrap,
  define,
  destroyAll,
  type Mounted,
  mount,
  settle,
  systems,
  takeWarnings,
} from "./angular-harness";

afterEach(async () => {
  await destroyAll();
  expect(takeWarnings()).toEqual([]);
});

function press(key = "ArrowDown", target: Document = document): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
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

/** A component that opens a scope named `name` and projects what it is given. */
function hookScope(
  selector: string,
  name: string,
  onIntent: (name: string) => IntentHandler,
  options?: InjectIntentOptions,
): Type<unknown> {
  return define(
    { selector, template: "<ng-content />" },
    class {
      constructor() {
        injectIntent((event) => onIntent(name)(event), options);
      }
    },
  );
}

/** Opens a scope through the host whenever `open` turns true, the way a machine does. */
function hostScope(
  selector: string,
  name: string,
  open: () => boolean,
  onIntent: (name: string) => IntentHandler,
  trapped?: boolean,
): Type<unknown> {
  return define(
    { selector, template: "" },
    class {
      constructor() {
        const host = injectIntentScopeHost();
        effect((onCleanup) => {
          if (!open() || host === null) return;
          onCleanup(host.pushScope(onIntent(name), { trapped }));
        });
      }
    },
  );
}

interface ProbeHooks {
  readonly onSystem?: ((system: InputSystem | null) => void) | undefined;
  readonly onHost?: ((host: IntentScopeHost | null) => void) | undefined;
  readonly onModality?: ((read: () => InputModality) => void) | undefined;
}

function probe(hooks: ProbeHooks = {}): Type<unknown> {
  return define(
    {
      selector: "nav-probe",
      template: `<span data-testid="ready">{{ render(system()) }}</span><span data-testid="modality">{{ modality() }}</span>`,
    },
    class {
      readonly system = injectInputSystem();
      readonly modality = injectInputModality();
      constructor() {
        hooks.onHost?.(injectIntentScopeHost());
        hooks.onModality?.(() => this.modality());
      }
      render(seen: InputSystem | null): string {
        hooks.onSystem?.(seen);
        return seen === null ? "no" : "yes";
      }
    },
  );
}

/** A scope that takes every intent and reports it. */
function intentScope(onIntent: (intent: string) => void): Type<unknown> {
  return define(
    { selector: "nav-scope", template: "<i>scope</i>" },
    class {
      constructor() {
        injectIntent((event) => {
          onIntent(event.intent);
          return true;
        });
      }
    },
  );
}

function root(imports: Type<unknown>[], template: string, fields: object = {}): Type<unknown> {
  return define(
    { selector: "nav-root", imports, template },
    class {
      constructor() {
        Object.assign(this, fields);
      }
    },
  );
}

function text(handle: Mounted, id: string): string {
  return handle.host.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";
}

describe("provideNav — what does and does not rebuild the system", () => {
  it("keeps the system when the getter returns a fresh array around the same plugins", async () => {
    const plugins = [spatialPlugin()];
    const { all, seen } = systems();
    const tick = signal(0);
    mount(root([probe({ onSystem: seen })], "<nav-probe />"), {
      providers: [
        provideNav(() => {
          tick();
          return { plugins: [...plugins] };
        }),
      ],
    });
    await settle();
    tick.set(1);
    await settle();

    expect(all).toHaveLength(1);
  });

  it("keeps the system when the getter returns a fresh keymap literal with the same keys", async () => {
    const { all, seen } = systems();
    const tick = signal(0);
    mount(root([probe({ onSystem: seen })], "<nav-probe />"), {
      providers: [
        provideNav(() => {
          tick();
          return { keymap: { keys: { w: "moveUp" } } };
        }),
      ],
    });
    await settle();
    tick.set(1);
    await settle();

    expect(all).toHaveLength(1);
  });

  it("rebuilds when the plugins themselves are built in the getter", async () => {
    const { all, seen } = systems();
    const tick = signal(0);
    // A new plugin object each time the getter re-runs: the contents changed, so the system
    // is rebuilt. Kept to make the cost visible, not to bless it.
    mount(root([probe({ onSystem: seen })], "<nav-probe />"), {
      providers: [
        provideNav(() => {
          tick();
          return { plugins: [spatialPlugin()] };
        }),
      ],
    });
    await settle();
    tick.set(1);
    await settle();

    expect(all).toHaveLength(2);
  });

  it("takes the options as a plain object", async () => {
    const onIntent = vi.fn();
    mount(root([intentScope(onIntent)], "<nav-scope />"), {
      providers: [provideNav({ keymap: { keys: { w: "moveUp" } } })],
    });
    await settle();

    press("w");

    expect(onIntent).toHaveBeenCalledWith("moveUp");
  });

  it("reads a Signal of options, and rebuilds when its content changes", async () => {
    const { all, seen } = systems();
    const onIntent = vi.fn();
    const options = signal<NavOptions>({});
    mount(root([probe({ onSystem: seen }), intentScope(onIntent)], "<nav-probe /><nav-scope />"), {
      providers: [provideNav(options)],
    });
    await settle();
    options.set({ keymap: { keys: { w: "moveUp" } } });
    await settle();

    press("w");

    expect(all).toHaveLength(2);
    expect(onIntent).toHaveBeenCalledWith("moveUp");
  });
});

describe("provideNav", () => {
  it("renders once with no system, then builds one after the first render and hands it down", async () => {
    const renders: (InputSystem | null)[] = [];
    const handle = mount(
      root([probe({ onSystem: (seen) => renders.push(seen) })], "<nav-probe />"),
      {
        providers: [provideNav()],
      },
    );
    await settle();

    expect(renders[0]).toBeNull();
    expect(text(handle, "ready")).toBe("yes");
  });

  it("turns a key into the intent a scope receives", async () => {
    const onIntent = vi.fn();
    mount(root([intentScope(onIntent)], "<nav-scope />"), { providers: [provideNav()] });
    await settle();

    press();

    expect(onIntent).toHaveBeenCalledWith("moveDown");
  });

  it("warns about a missing provider, and only once the component has rendered", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const inside = mount(root([intentScope(() => {})], "<nav-scope />"), {
        providers: [provideNav()],
      });
      await settle();
      expect(warn).not.toHaveBeenCalled();
      inside.destroy();

      const outside = mount(root([intentScope(() => {})], "<nav-scope />"));
      await outside.ready;
      expect(warn).not.toHaveBeenCalled();
      await settle();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("destroys the system when the application is destroyed", async () => {
    const onIntent = vi.fn();
    const handle = mount(root([intentScope(onIntent)], "<nav-scope />"), {
      providers: [provideNav()],
    });
    await settle();
    handle.destroy();

    press();

    expect(onIntent).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute("data-snav-input")).toBe(false);
  });
});

describe("where provideNav goes, and when it builds", () => {
  // App mode focuses on hover, and the runner's pointer rests where the first button renders.
  const plugins = [spatialPlugin({ mode: "app", pointerFollowsFocus: false })];
  const buttons = `<button type="button" id="first">first</button><button type="button" id="second">second</button>`;
  async function arrowRightMoves(): Promise<boolean> {
    document.querySelector<HTMLElement>("#first")?.focus();
    press("ArrowRight");
    await settle();
    return document.activeElement?.id === "second";
  }

  it("builds a system at bootstrap when nothing injects anything, for a plugin and no scope", async () => {
    const Page = define({ selector: "nav-eager", template: buttons }, class {});
    bootstrap(Page, "nav-eager", [provideNav({ plugins })]);
    await settle();

    expect(await arrowRightMoves()).toBe(true);
  });

  it("builds one in an environment injector created the way a route's is", async () => {
    const Page = define({ selector: "nav-route", template: buttons }, class {});
    mount(Page, {
      environment: (app) => createEnvironmentInjector(provideNav({ plugins }), app.injector),
    });
    await settle();

    expect(await arrowRightMoves()).toBe(true);
  });

  it("builds one in a component's providers once the providing component asks for it", async () => {
    const Page = define(
      { selector: "nav-local", providers: provideNav({ plugins }), template: buttons },
      class {
        readonly system = injectInputSystem();
      },
    );
    mount(Page);
    await settle();

    expect(await arrowRightMoves()).toBe(true);
  });

  it("builds nothing in a component's providers that nothing asks for", async () => {
    // The rule the Angular page states: a component's providers are created on first request,
    // and nothing runs them at start-up.
    const Page = define(
      { selector: "nav-idle", providers: provideNav({ plugins }), template: buttons },
      class {},
    );
    mount(Page);
    await settle();

    expect(await arrowRightMoves()).toBe(false);
  });
});

describe("injectInputModality", () => {
  it("follows the document's modality without needing a provider", async () => {
    const handle = mount(root([probe()], "<nav-probe />"));
    await settle();

    document.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
    );
    await settle();
    expect(text(handle, "modality")).toBe("pointer");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await settle();
    expect(text(handle, "modality")).toBe("keyboard");
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
      mount(root([intentScope(onIntent)], "<nav-scope />"), {
        providers: [provideNavDocument(() => frameDocument), provideNav()],
      });
      await settle();

      press();
      expect(onIntent).not.toHaveBeenCalled();

      press("ArrowDown", frameDocument);
      expect(onIntent).toHaveBeenCalledWith("moveDown");
    } finally {
      await destroyAll();
      frame.remove();
    }
  });
});

describe("the order of scopes opened in one render", () => {
  it("opens a child in its parent's template before its parent", async () => {
    const { seen, handler } = recorder();
    const Child = hookScope("nav-child", "child", handler);
    const Parent = define(
      { selector: "nav-parent", imports: [Child], template: "<nav-child />" },
      class {
        constructor() {
          injectIntent(handler("parent"));
        }
      },
    );
    mount(root([Parent], "<nav-parent />"), { providers: [provideNav()] });
    await settle();

    press();

    expect(seen).toEqual(["parent", "child"]);
  });

  it("opens a child projected into its parent before its parent", async () => {
    const { seen, handler } = recorder();
    // Declared in the host's template, not in the outer component's: only the DOM says that
    // the inner element sits inside the outer one.
    const Outer = hookScope("nav-outer", "outer", handler);
    const Inner = hookScope("nav-inner", "inner", handler);
    mount(root([Outer, Inner], "<nav-outer><nav-inner /></nav-outer>"), {
      providers: [provideNav()],
    });
    await settle();

    press();

    expect(seen).toEqual(["outer", "inner"]);
  });

  it("opens siblings in the order they are declared", async () => {
    const { seen, handler } = recorder();
    const First = hookScope("nav-first", "first", handler);
    const Second = hookScope("nav-second", "second", handler);
    mount(root([First, Second], "<nav-first /><nav-second />"), { providers: [provideNav()] });
    await settle();

    press();

    expect(seen).toEqual(["second", "first"]);
  });
});

/**
 * A scope host is what a machine is handed, and a machine opens its scopes whenever its
 * state changes. Each handler here records its name and declines, so the list is the
 * order of the stack down to the first trap.
 */
describe("injectIntentScopeHost, and scope order across a rebuild", () => {
  const REMAPPED: KeymapOverrides = { keys: { w: "moveUp" } };

  it("answers a scope opened while the component is constructed, before the system exists", async () => {
    const { seen, handler } = recorder();
    const atInit: unknown[] = [];
    const Machine = define(
      { selector: "nav-machine", template: "" },
      class {
        constructor() {
          const host = injectIntentScopeHost();
          atInit.push(host, injectInputSystem()());
          host?.pushScope(handler("machine"));
        }
      },
    );
    mount(root([Machine], "<nav-machine />"), { providers: [provideNav()] });
    await settle();
    press();

    expect(atInit[0]).not.toBeNull();
    expect(atInit[1]).toBeNull();
    expect(seen).toEqual(["machine"]);
  });

  it("answers null without a provider, and hands one host to a provider's tree across a rebuild", async () => {
    const hosts: (IntentScopeHost | null)[] = [];
    const Reader = define(
      { selector: "nav-reader", template: "" },
      class {
        constructor() {
          hosts.push(injectIntentScopeHost());
        }
      },
    );

    const alone = mount(root([Reader], "<nav-reader />"));
    await settle();
    expect(hosts).toEqual([null]);
    alone.destroy();
    hosts.length = 0;

    const keymap = signal<KeymapOverrides | undefined>(undefined);
    const shown = signal(false);
    mount(root([Reader], "<nav-reader />@if (shown()) {<nav-reader />}", { shown }), {
      providers: [provideNav(() => ({ keymap: keymap() }))],
    });
    await settle();
    keymap.set(REMAPPED);
    shown.set(true);
    await settle();

    expect(hosts).toHaveLength(2);
    expect(hosts[0]).not.toBeNull();
    expect(hosts[1]).toBe(hosts[0]);
  });

  it("keeps sibling host scopes in the order they were opened", async () => {
    const { seen, handler } = recorder();
    const { all, seen: onSystem } = systems();
    const aOpen = signal(false);
    const keymap = signal<KeymapOverrides | undefined>(undefined);
    // "a" is declared first, opened second and traps: issue #13's own probe.
    const A = hostScope("nav-a", "a", aOpen, handler, true);
    const B = hostScope("nav-b", "b", () => true, handler);
    mount(root([probe({ onSystem }), A, B], "<nav-probe /><nav-a /><nav-b />"), {
      providers: [provideNav(() => ({ keymap: keymap() }))],
    });
    await settle();
    aOpen.set(true);
    await settle();
    press();
    expect(seen).toEqual(["a"]);

    keymap.set(REMAPPED);
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["a", "a"]);
  });

  it("keeps a host trap above a hook scope opened before it", async () => {
    const { seen, handler } = recorder();
    const { all, seen: onSystem } = systems();
    const open = signal(false);
    const keymap = signal<KeymapOverrides | undefined>(undefined);
    const Dialog = hostScope("nav-dialog", "dialog", open, handler, true);
    const Composite = hookScope("nav-composite", "composite", handler);
    mount(
      root(
        [probe({ onSystem }), Dialog, Composite],
        "<nav-probe /><nav-dialog /><nav-composite />",
      ),
      { providers: [provideNav(() => ({ keymap: keymap() }))] },
    );
    await settle();
    open.set(true);
    await settle();
    press();
    expect(seen).toEqual(["dialog"]);

    keymap.set(REMAPPED);
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["dialog", "dialog"]);
  });

  it("keeps a nested composite under the trap of the dialog around it", async () => {
    const { seen, handler } = recorder();
    const { all, seen: onSystem } = systems();
    const open = signal(false);
    const keymap = signal<KeymapOverrides | undefined>(undefined);
    const Dialog = hostScope("nav-dialog", "dialog", open, handler, true);
    const Composite = hookScope("nav-composite", "composite", handler);
    const Item = hookScope("nav-item", "item", handler);
    mount(
      root(
        [probe({ onSystem }), Dialog, Composite, Item],
        "<nav-probe /><nav-dialog /><nav-composite><nav-item /></nav-composite>",
      ),
      { providers: [provideNav(() => ({ keymap: keymap() }))] },
    );
    await settle();
    press();
    // The item is inside the composite, so its scope was opened first.
    expect(seen).toEqual(["composite", "item"]);
    seen.length = 0;

    open.set(true);
    await settle();
    press();
    expect(seen).toEqual(["dialog"]);

    keymap.set(REMAPPED);
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["dialog", "dialog"]);
  });

  it("keeps a hook scope opened over a host trap above that trap", async () => {
    const { seen, handler } = recorder();
    const { all, seen: onSystem } = systems();
    const menu = signal(false);
    const keymap = signal<KeymapOverrides | undefined>(undefined);
    const Menu = hookScope("nav-menu", "menu", handler);
    const Dialog = hostScope("nav-dialog", "dialog", () => true, handler, true);
    mount(
      root(
        [probe({ onSystem }), Menu, Dialog],
        "<nav-probe />@if (menu()) {<nav-menu />}<nav-dialog />",
        { menu },
      ),
      { providers: [provideNav(() => ({ keymap: keymap() }))] },
    );
    await settle();
    menu.set(true);
    await settle();
    press();
    expect(seen).toEqual(["menu", "dialog"]);

    keymap.set(REMAPPED);
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["menu", "dialog", "menu", "dialog"]);
  });

  it("re-opens a scope in its place when a signal it was given for trapped changes", async () => {
    const { seen, handler } = recorder();
    const trapped = signal(false);
    const Below = hookScope("nav-below", "below", handler);
    const Page = hookScope("nav-page", "page", handler, { trapped });
    const Above = hookScope("nav-above", "above", handler);
    mount(root([Below, Page, Above], "<nav-below /><nav-page /><nav-above />"), {
      providers: [provideNav()],
    });
    await settle();
    press();
    expect(seen).toEqual(["above", "page", "below"]);
    seen.length = 0;

    trapped.set(true);
    await settle();
    press();

    // The trap took effect, since "below" is silenced, and "page" is still beneath "above":
    // a re-push of the one scope would have lifted it on top and silenced "above" too.
    expect(seen).toEqual(["above", "page"]);
  });

  it("releases every scope when the components are destroyed, the provider still up", async () => {
    const { seen, handler } = recorder();
    const shown = signal(true);
    const Host = hostScope("nav-host", "host", () => true, handler);
    const Hook = hookScope("nav-hook", "hook", handler);
    mount(root([Host, Hook], "@if (shown()) {<nav-host /><nav-hook />}", { shown }), {
      providers: [provideNav()],
    });
    await settle();
    press();
    expect(seen).toEqual(["hook", "host"]);

    shown.set(false);
    await settle();
    press();

    expect(seen).toEqual(["hook", "host"]);
  });

  it("lets a host scope be disposed after the provider is gone", async () => {
    const { handler } = recorder();
    let dispose: VoidFunction | undefined;
    const Leaky = define(
      { selector: "nav-leaky", template: "" },
      class {
        constructor() {
          const host = injectIntentScopeHost();
          afterNextRender(() => {
            dispose = host?.pushScope(handler("leaky"));
          });
        }
      },
    );
    const handle = mount(root([Leaky], "<nav-leaky />"), { providers: [provideNav()] });
    await settle();
    handle.destroy();

    expect(dispose).toBeTypeOf("function");
    expect(() => dispose?.()).not.toThrow();
    expect(() => dispose?.()).not.toThrow();
  });

  it("releases a scope whose component outlives the provider's own teardown", async () => {
    // A component's providers are torn down before the component itself, so the scope below
    // is released after its system is gone.
    const { seen, handler } = recorder();
    const Scope = hookScope("nav-held", "held", handler);
    const Holder = define(
      {
        selector: "nav-holder",
        imports: [Scope],
        providers: provideNav(),
        template: "<nav-held />",
      },
      class {},
    );
    const handle = mount(root([Holder], "<nav-holder />"));
    await settle();
    press();
    expect(seen).toEqual(["held"]);

    handle.destroy();
    press();

    expect(seen).toEqual(["held"]);
    expect(document.documentElement.hasAttribute("data-snav-input")).toBe(false);
  });
});

describe("injectIntent — a composite inside a trapping dialog (ADR-0025)", () => {
  const CHOICES = ["low", "medium", "high"] as const;
  type Within = "element-ref" | "signal" | "none";

  function checked(): string | undefined {
    return document.querySelector<HTMLInputElement>("input[name=level]:checked")?.value;
  }

  function radioGroup(within: Within): Type<unknown> {
    return define(
      {
        selector: "nav-level",
        template: `<div role="radiogroup">@for (choice of choices; track choice; let index = $index) {<label><input type="radio" name="level" [value]="choice" [checked]="index === at()" />{{ choice }}</label>}</div>`,
      },
      class {
        readonly choices = CHOICES;
        readonly at = signal(0);
        constructor() {
          const host = inject<ElementRef<HTMLElement>>(ElementRef);
          const group = signal<Element | null>(null);
          afterNextRender(() => group.set(host.nativeElement.querySelector("[role=radiogroup]")));
          injectIntent(
            (event) => {
              if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
              const step = event.intent === "moveDown" ? 1 : -1;
              this.at.update((at) => Math.max(0, Math.min(CHOICES.length - 1, at + step)));
              return true;
            },
            { within: within === "element-ref" ? host : within === "signal" ? group : undefined },
          );
        }
      },
    );
  }

  /** The recipe of docs/en/angular.md: the dialog traps and names its surface. */
  function dialog(onClose: VoidFunction, surface?: Element): Type<unknown> {
    return define(
      {
        selector: "nav-dialog",
        template: `<div data-snav="container" data-snav-trap><ng-content /></div>`,
      },
      class {
        constructor() {
          injectIntent(
            (event) => {
              if (event.intent !== "back") return false;
              onClose();
              return true;
            },
            { trapped: true, within: surface ?? inject(ElementRef) },
          );
        }
      },
    );
  }

  function page(within: Within, onClose: VoidFunction, surface?: Element): Type<unknown> {
    const open = signal(true);
    const close = (): void => {
      onClose();
      open.set(false);
    };
    return root(
      [dialog(close, surface), radioGroup(within)],
      "@if (open()) {<nav-dialog><nav-level /></nav-dialog>}",
      { open },
    );
  }

  const plugins = [spatialPlugin({ mode: "app" })];

  it("moves a radio group mounted with its dialog, both passing their ElementRef", async () => {
    const onClose = vi.fn();
    mount(page("element-ref", onClose), { providers: [provideNav({ plugins })] });
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

  it("moves the radio group when its within is a signal filled after the first render", async () => {
    mount(
      page("signal", () => {}),
      { providers: [provideNav({ plugins })] },
    );
    await settle();

    press("ArrowDown");
    await settle();

    expect(checked()).toBe("medium");
  });

  it("moves the radio group when the dialog's within is an element that existed before", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    mount(
      page("element-ref", () => {}, container),
      {
        host: container,
        providers: [provideNav({ plugins })],
      },
    );
    await settle();

    press("ArrowDown");
    await settle();

    expect(checked()).toBe("medium");
  });

  it("keeps a radio group that names no element silenced, as before", async () => {
    mount(
      page("none", () => {}),
      { providers: [provideNav({ plugins })] },
    );
    await settle();

    press("ArrowDown");
    await settle();

    expect(checked()).toBe("low");
  });

  it("does not open the scope again when its element fills or change detection runs again", async () => {
    let system: InputSystem | null = null;
    const tick = signal(0);
    const Composite = define(
      {
        selector: "nav-composite",
        template: `<div [attr.data-tick]="tick()"></div>`,
      },
      class {
        readonly tick = tick;
        constructor() {
          const host = inject<ElementRef<HTMLElement>>(ElementRef);
          const element = signal<Element | null>(null);
          afterNextRender(() => element.set(host.nativeElement.querySelector("div")));
          injectIntent(() => false, { within: element });
        }
      },
    );
    mount(
      root(
        [
          probe({
            onSystem: (seen) => {
              system = seen;
            },
          }),
          Composite,
        ],
        "<nav-probe /><nav-composite />",
      ),
      { providers: [provideNav()] },
    );
    await settle();
    const built = system as InputSystem | null;
    if (built === null) throw new Error("no system");
    const pushScope = vi.spyOn(built, "pushScope");

    tick.set(1);
    await settle();
    tick.set(2);
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

  it("lets a real ArrowDown check the next radio through injectIntent", async () => {
    // The recipe of docs/en/angular.md: native radios in app mode keep their own axis.
    const Sizes = define(
      {
        selector: "nav-sizes",
        template: `<div role="radiogroup">@for (size of sizes; track size) {<label style="display: block"><input type="radio" name="size" [value]="size" [checked]="size === 's'" />{{ size }}</label>}</div>`,
      },
      class {
        readonly sizes = ["s", "m", "l"];
        constructor() {
          const host = inject<ElementRef<HTMLElement>>(ElementRef);
          injectIntent(
            (event) =>
              event.source === "keyboard" &&
              (event.intent === "moveUp" || event.intent === "moveDown") &&
              host.nativeElement.contains(document.activeElement)
                ? "native"
                : false,
            { within: host },
          );
        }
      },
    );
    mount(
      root(
        [Sizes],
        `<div style="display: flex"><nav-sizes /><button type="button" id="after">after</button></div>`,
      ),
      {
        providers: [provideNav({ plugins })],
      },
    );
    await settle();
    document.querySelector<HTMLInputElement>("input[value=s]")?.focus();

    await userEvent.keyboard("{ArrowDown}");

    expect(checked()).toBe("m");
    expect((document.activeElement as HTMLInputElement | null)?.value).toBe("m");

    // The other axis stays the engine's, so the button beside the group is reachable.
    await userEvent.keyboard("{ArrowRight}");

    expect(checked()).toBe("m");
    expect(document.activeElement?.id).toBe("after");
  });

  it("hands a host scope's native answer back unchanged", async () => {
    let host: IntentScopeHost | null = null;
    mount(
      root(
        [
          probe({
            onHost: (seen) => {
              host = seen;
            },
          }),
        ],
        `<nav-probe /><button type="button" id="first">first</button><button type="button" id="second">second</button>`,
      ),
      { providers: [provideNav({ plugins })] },
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
 * on-screen keyboard mutates the field and then fires `input`. Angular's `[value]` with an
 * `(input)` listener that reads `value` back is the binding a signal-driven field uses.
 */
describe("the on-screen keyboard against a [value] and (input) binding", () => {
  for (const type of ["text", "email"] as const) {
    it(`reaches the bound value of a ${type} field`, async () => {
      const model = signal("");
      const Field = define(
        {
          selector: "nav-field",
          template: `<input [type]="type" [value]="model()" (input)="read($event)" />`,
        },
        class {
          readonly type = type;
          readonly model = model;
          read(event: Event): void {
            model.set((event.target as HTMLInputElement).value);
          }
        },
      );
      const keyboard = keyboardPlugin({ layout: alphabetic, openOn: "focus" });
      const handle = mount(root([Field], "<nav-field />"), {
        providers: [provideNav({ plugins: [keyboard] })],
      });
      await settle();
      const field = handle.host.querySelector("input");
      if (field === null) throw new Error("no field");
      field.focus();
      await settle();

      const key = document.querySelector<HTMLButtonElement>("[data-snav-keyboard] button");
      if (key === null) throw new Error("the keyboard did not open");
      key.click();
      await settle();

      expect({ dom: field.value, model: model() }).toEqual({ dom: "a", model: "a" });
    });
  }
});

/**
 * Angular passes the same gate as React, Vue and Svelte. The tree's shape is one signal read by
 * the root component's template, so `update` is a `set` and nothing is created again.
 */
const parity = (() => {
  const shape = signal<ParityTree>({});
  let handle: Mounted | null = null;
  let run: {
    readonly intents: string[];
    readonly released: string[];
    readonly renders: (InputSystem | null)[];
    system: InputSystem | null;
    modality: Signal<InputModality> | null;
  } = { intents: [], released: [], renders: [], system: null, modality: null };

  function named(name: "outer" | "inner", selector: string): Type<unknown> {
    return define(
      { selector, template: "<ng-content />" },
      class {
        constructor() {
          const mine = run;
          const element = (): Element | null => document.querySelector(`[data-parity="${name}"]`);
          injectIntent(
            (event) => {
              mine.intents.push(`${name}:${event.intent}`);
              return false;
            },
            {
              trapped: () => (name === "inner" ? shape().trapped : shape().outerTrapped) ?? false,
              base: () => (name === "outer" ? (shape().base ?? false) : false),
              within: () => (shape().within ? element() : undefined),
            },
          );
          inject(DestroyRef).onDestroy(() => mine.released.push(name));
        }
      },
    );
  }

  const Outer = named("outer", "parity-outer");
  const Inner = named("inner", "parity-inner");
  // One plugin for the life of a mount, so that only `keymap` rebuilds the system.
  let plugins = [spatialPlugin()];

  const Tree = define(
    {
      selector: "parity-tree",
      imports: [Outer, Inner],
      template: `
      <div data-parity="outer"><div data-parity="inner"></div></div>{{ track() }}
      @if (shape().outer ?? true) {
        <parity-outer>@if (shape().nested && (shape().inner ?? true)) {<parity-inner />}</parity-outer>
      }
      @if (!shape().nested && (shape().inner ?? true)) {<parity-inner />}
    `,
    },
    class {
      readonly shape = shape;
      readonly system = injectInputSystem();
      readonly modality = injectInputModality();
      track(): string {
        run.renders.push(this.system());
        run.system = this.system();
        run.modality = this.modality;
        return "";
      }
    },
  );

  return {
    name: "angular",
    mount(tree?: ParityTree | undefined): ParityProbe {
      const mine: typeof run = {
        intents: [],
        released: [],
        renders: [],
        system: null,
        modality: null,
      };
      run = mine;
      plugins = [spatialPlugin()];
      shape.set(tree ?? {});
      handle = mount(Tree, {
        providers: [provideNav(() => ({ plugins, keymap: shape().keymap }))],
      });
      return {
        system: () => mine.system,
        renders: () => mine.renders,
        modality: () => mine.modality?.() ?? "pointer",
        intents: () => mine.intents,
        released: () => mine.released,
      };
    },
    update(tree: ParityTree): void {
      shape.set(tree);
    },
    unmount(): void {
      handle?.destroy();
      handle = null;
    },
    settle,
    act(action: VoidFunction): void {
      action();
    },
  };
})();

runAdapterParitySuite(parity);
