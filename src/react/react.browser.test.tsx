import {
  createRef,
  type ReactNode,
  type RefObject,
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { type ParityProbe, type ParityTree, runAdapterParitySuite } from "../adapter-parity";
import type { IntentHandler } from "../intent-bus";
import { keyboardPlugin } from "../keyboard/keyboard";
import { alphabetic } from "../keyboard/layouts/alphabetic";
import { spatialPlugin } from "../spatial/spatial";
import type { InputModality } from "../types";
import {
  type InputSystem,
  NavProvider,
  useInputModality,
  useInputSystem,
  useIntent,
  useIntentScopeHost,
} from "./react";
import { fire, mount, settle, unmountAll } from "./react-harness";

afterEach(() => {
  unmountAll();
  document.body.querySelector("#parity-host")?.remove();
});

function Scope({ onIntent }: { readonly onIntent: (intent: string) => void }): ReactNode {
  const system = useInputSystem();
  useIntent((event) => {
    onIntent(event.intent);
    return true;
  });
  return <span data-testid="ready">{system === null ? "no" : "yes"}</span>;
}

describe("NavProvider — what does and does not rebuild the system", () => {
  function systemsSeen(): {
    readonly Probe: () => ReactNode;
    readonly distinct: () => number;
  } {
    const seen: unknown[] = [];
    return {
      Probe: (): ReactNode => {
        const system = useInputSystem();
        if (system !== null) seen.push(system);
        return null;
      },
      distinct: (): number => new Set(seen).size,
    };
  }

  it("keeps the system across a re-render when the plugin instances are stable", async () => {
    const plugins = [spatialPlugin()];
    const { Probe, distinct } = systemsSeen();

    // A fresh array literal every render, around the same plugin objects. This is
    // what `useStableList` is for, and all it is for.
    const handle = mount(
      <NavProvider plugins={[...plugins]}>
        <Probe />
      </NavProvider>,
    );
    await settle();
    handle.render(
      <NavProvider plugins={[...plugins]}>
        <Probe />
      </NavProvider>,
    );
    await settle();

    expect(distinct()).toBe(1);
  });

  it("rebuilds when the plugins themselves are built inline", async () => {
    const { Probe, distinct } = systemsSeen();

    // `plugins={[spatialPlugin()]}` constructs a NEW plugin object on every render,
    // and the list is compared element by element with `Object.is` — so the contents
    // genuinely did change and the system is torn down and rebuilt. The cost is real
    // (a destroy, a rebuild, and the modality refcount going to zero and back), so
    // the contract is that plugin instances are hoisted or memoised by the caller.
    // This case exists to keep that cost visible rather than to bless it.
    const handle = mount(
      <NavProvider plugins={[spatialPlugin()]}>
        <Probe />
      </NavProvider>,
    );
    await settle();
    handle.render(
      <NavProvider plugins={[spatialPlugin()]}>
        <Probe />
      </NavProvider>,
    );
    await settle();

    expect(distinct()).toBe(2);
  });
});

describe("NavProvider", () => {
  it("builds one system in an effect and hands it down", async () => {
    const { container } = mount(
      <NavProvider>
        <Scope onIntent={() => {}} />
      </NavProvider>,
    );
    await settle();

    expect(container.querySelector('[data-testid="ready"]')?.textContent).toBe("yes");
  });

  it("turns a key into the intent a scope receives", async () => {
    const onIntent = vi.fn();
    mount(
      <NavProvider>
        <Scope onIntent={onIntent} />
      </NavProvider>,
    );
    await settle();

    fire(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    expect(onIntent).toHaveBeenCalledWith("moveDown");
  });

  it("does not push the scope again when the handler identity changes", async () => {
    const seen: string[] = [];
    function Counter(): ReactNode {
      const [count, setCount] = useState(0);
      // A fresh arrow on every render — the case a naive effect would re-push on.
      useIntent(() => {
        seen.push(`intent:${count}`);
        return true;
      });
      useEffect(() => {
        if (count === 0) setCount(1);
      }, [count]);
      return null;
    }

    mount(
      <NavProvider>
        <Counter />
      </NavProvider>,
    );
    await settle();

    fire(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    expect(seen).toEqual(["intent:1"]);
  });

  it("warns about a missing provider, and not about a system still being built", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const inside = mount(
        <NavProvider>
          <Scope onIntent={() => {}} />
        </NavProvider>,
      );
      await settle();
      expect(warn).not.toHaveBeenCalled();
      inside.unmount();

      mount(<Scope onIntent={() => {}} />);
      await settle();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("destroys the system on unmount", async () => {
    const onIntent = vi.fn();
    const handle = mount(
      <NavProvider>
        <Scope onIntent={onIntent} />
      </NavProvider>,
    );
    await settle();
    handle.unmount();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

    expect(onIntent).not.toHaveBeenCalled();
  });
});

describe("useInputModality", () => {
  it("follows the document's modality without needing a provider", async () => {
    function Probe(): ReactNode {
      return <span data-testid="modality">{useInputModality()}</span>;
    }
    const { container } = mount(<Probe />);
    await settle();

    const read = (): string =>
      container.querySelector('[data-testid="modality"]')?.textContent ?? "";

    fire(() => {
      document.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
      );
    });
    expect(read()).toBe("pointer");

    fire(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(read()).toBe("keyboard");
  });
});

/**
 * The two cases worth keeping from the monorepo's gamepad test file, whose other
 * six mount the provider and then test a design-system control. Rebuilt over
 * plain buttons, they become what they always were: tests of the input system's
 * activateFocused guard, reached through the adapter. No Gamepad API fake at all
 * — `emit` is how a pad publishes, so a test simulates one by saying so.
 */
describe("a pad, through the provider, on a plain button", () => {
  function Button({ onClick }: { readonly onClick: VoidFunction }): ReactNode {
    const system = useInputSystem();
    return (
      <div>
        <button type="button" id="target" onClick={onClick}>
          go
        </button>
        <button
          type="button"
          id="pad"
          onClick={() => system?.emit({ intent: "select", source: "gamepad" })}
        >
          pad
        </button>
      </div>
    );
  }

  it("activates the focused button with no component knowing a pad exists", async () => {
    const clicks = vi.fn();
    const { container } = mount(
      <NavProvider>
        <Button onClick={clicks} />
      </NavProvider>,
    );
    await settle();
    const target = container.querySelector("#target") as HTMLButtonElement;
    target.focus();

    fire(() => {
      (container.querySelector("#pad") as HTMLButtonElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it("stands aside when a scope claimed the activation first", async () => {
    const clicks = vi.fn();
    function Claiming(): ReactNode {
      useIntent(() => true);
      return null;
    }
    const { container } = mount(
      <NavProvider>
        <Button onClick={clicks} />
        <Claiming />
      </NavProvider>,
    );
    await settle();
    (container.querySelector("#target") as HTMLButtonElement).focus();

    fire(() => {
      (container.querySelector("#pad") as HTMLButtonElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(clicks).not.toHaveBeenCalled();
  });
});

/**
 * A scope host is what a machine is handed, and a machine opens its scopes from layout
 * effects on whatever commit its state changes. Each handler here records its name and
 * declines, so the list is the order of the stack down to the first trap.
 */
describe("useIntentScopeHost, and scope order across a rebuild", () => {
  const REMAPPED = { keys: { w: "moveUp" as const } };

  function press(): void {
    fire(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
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

  function HostScope({
    name,
    open,
    trapped,
    onIntent,
  }: {
    readonly name: string;
    readonly open: boolean;
    readonly trapped?: boolean | undefined;
    readonly onIntent: (name: string) => IntentHandler;
  }): ReactNode {
    const host = useIntentScopeHost();
    useLayoutEffect(() => {
      if (!open || host === null) return;
      return host.pushScope(onIntent(name), { trapped });
    }, [open, host, name, trapped, onIntent]);
    return null;
  }

  function HookScope({
    name,
    onIntent,
    children,
  }: {
    readonly name: string;
    readonly onIntent: (name: string) => IntentHandler;
    readonly children?: ReactNode;
  }): ReactNode {
    useIntent(onIntent(name));
    return children;
  }

  function Systems(): { readonly Probe: () => ReactNode; readonly all: unknown[] } {
    const all: unknown[] = [];
    return {
      all,
      Probe: (): ReactNode => {
        const system = useInputSystem();
        if (system !== null && !all.includes(system)) all.push(system);
        return null;
      },
    };
  }

  it("answers a scope opened on the first commit, before the system exists", async () => {
    const { seen, handler } = recorder();
    const firstRender: unknown[] = [];
    function FirstCommit(): ReactNode {
      const host = useIntentScopeHost();
      const system = useInputSystem();
      if (firstRender.length === 0) firstRender.push(host, system);
      // `host` only: the host has to carry the scope onto the system itself.
      useLayoutEffect(() => host?.pushScope(handler("machine")), [host]);
      return null;
    }

    mount(
      <NavProvider>
        <FirstCommit />
      </NavProvider>,
    );
    await settle();
    press();

    expect(firstRender[0]).not.toBeNull();
    expect(firstRender[1]).toBeNull();
    expect(seen).toEqual(["machine"]);
  });

  it("answers null without a provider, and keeps one host object across a rebuild", async () => {
    const hosts: unknown[] = [];
    // Reads the system too, so that it re-renders with every system it is handed.
    function Reader(): ReactNode {
      useInputSystem();
      hosts.push(useIntentScopeHost());
      return null;
    }

    const bare = mount(<Reader />);
    expect(hosts).toEqual([null]);
    bare.unmount();
    hosts.length = 0;

    const handle = mount(
      <NavProvider>
        <Reader />
      </NavProvider>,
    );
    await settle();
    handle.render(
      <NavProvider keymap={REMAPPED}>
        <Reader />
      </NavProvider>,
    );
    await settle();

    expect(hosts.length).toBeGreaterThan(2);
    expect(new Set(hosts).size).toBe(1);
    expect(hosts[0]).not.toBeNull();
  });

  it("keeps sibling host scopes in the order they were opened", async () => {
    const { seen, handler } = recorder();
    const { Probe, all } = Systems();
    // "a" is declared first, opened second and traps: the issue's own probe.
    const tree = (aOpen: boolean, keymap?: typeof REMAPPED): ReactNode => (
      <NavProvider keymap={keymap}>
        <Probe />
        <HostScope name="a" open={aOpen} trapped onIntent={handler} />
        <HostScope name="b" open onIntent={handler} />
      </NavProvider>
    );
    const handle = mount(tree(false));
    await settle();
    handle.render(tree(true));
    await settle();
    press();
    expect(seen).toEqual(["a"]);

    handle.render(tree(true, REMAPPED));
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["a", "a"]);
  });

  it("keeps a host trap above a hook scope opened before it", async () => {
    const { seen, handler } = recorder();
    const { Probe, all } = Systems();
    // The composite's hook scope is open first; the dialog's machine opens its trap
    // afterwards, so the trap is the later scope and has to stay the higher one.
    const tree = (open: boolean, keymap?: typeof REMAPPED): ReactNode => (
      <NavProvider keymap={keymap}>
        <Probe />
        <HostScope name="dialog" open={open} trapped onIntent={handler} />
        <HookScope name="composite" onIntent={handler} />
      </NavProvider>
    );
    const handle = mount(tree(false));
    await settle();
    handle.render(tree(true));
    await settle();
    press();
    expect(seen).toEqual(["dialog"]);

    handle.render(tree(true, REMAPPED));
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["dialog", "dialog"]);
  });

  it("keeps a nested composite under the trap of the dialog around it", async () => {
    const { seen, handler } = recorder();
    const { Probe, all } = Systems();
    function Dialog({
      open,
      children,
    }: {
      readonly open: boolean;
      readonly children?: ReactNode;
    }): ReactNode {
      return (
        <>
          <HostScope name="dialog" open={open} trapped onIntent={handler} />
          {children}
        </>
      );
    }
    const tree = (open: boolean, keymap?: typeof REMAPPED): ReactNode => (
      <NavProvider keymap={keymap}>
        <Probe />
        <Dialog open={open}>
          <HookScope name="composite" onIntent={handler}>
            <HookScope name="item" onIntent={handler} />
          </HookScope>
        </Dialog>
      </NavProvider>
    );
    const handle = mount(tree(false));
    await settle();
    press();
    // A child's effect runs before its parent's, so "item" was opened first.
    expect(seen).toEqual(["composite", "item"]);
    seen.length = 0;

    handle.render(tree(true));
    await settle();
    press();
    expect(seen).toEqual(["dialog"]);

    handle.render(tree(true, REMAPPED));
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["dialog", "dialog"]);
  });

  it("keeps a hook scope opened over a host trap above that trap", async () => {
    const { seen, handler } = recorder();
    const { Probe, all } = Systems();
    const tree = (menu: boolean, keymap?: typeof REMAPPED): ReactNode => (
      <NavProvider keymap={keymap}>
        <Probe />
        {menu && <HookScope name="menu" onIntent={handler} />}
        <HostScope name="dialog" open trapped onIntent={handler} />
      </NavProvider>
    );
    const handle = mount(tree(false));
    await settle();
    handle.render(tree(true));
    await settle();
    press();
    expect(seen).toEqual(["menu", "dialog"]);

    handle.render(tree(true, REMAPPED));
    await settle();
    press();

    expect(all).toHaveLength(2);
    expect(seen).toEqual(["menu", "dialog", "menu", "dialog"]);
  });

  it("leaves one registration per scope under StrictMode, across a rebuild too", async () => {
    const { seen, handler } = recorder();
    const tree = (keymap?: typeof REMAPPED): ReactNode => (
      <StrictMode>
        <NavProvider keymap={keymap}>
          <HostScope name="host" open onIntent={handler} />
          <HookScope name="hook" onIntent={handler} />
        </NavProvider>
      </StrictMode>
    );
    const handle = mount(tree());
    await settle();
    press();
    expect(seen).toEqual(["hook", "host"]);

    handle.render(tree(REMAPPED));
    await settle();
    press();

    expect(seen).toEqual(["hook", "host", "hook", "host"]);
  });

  it("releases every scope when the components unmount, the provider still up", async () => {
    const { seen, handler } = recorder();
    const tree = (shown: boolean): ReactNode => (
      <NavProvider>
        {shown && <HostScope name="host" open onIntent={handler} />}
        {shown && <HookScope name="hook" onIntent={handler} />}
      </NavProvider>
    );
    const handle = mount(tree(true));
    await settle();
    press();
    expect(seen).toEqual(["hook", "host"]);

    handle.render(tree(false));
    await settle();
    press();

    expect(seen).toEqual(["hook", "host"]);
  });

  it("lets a host scope be disposed after the provider is gone", async () => {
    const { handler } = recorder();
    let dispose: VoidFunction | undefined;
    function Leaky(): ReactNode {
      const host = useIntentScopeHost();
      useLayoutEffect(() => {
        dispose = host?.pushScope(handler("leaky"));
      }, [host]);
      return null;
    }
    const handle = mount(
      <NavProvider>
        <Leaky />
      </NavProvider>,
    );
    await settle();
    handle.unmount();

    expect(() => dispose?.()).not.toThrow();
    expect(() => dispose?.()).not.toThrow();
  });
});

describe("useIntent — a composite inside a trapping dialog (ADR-0025)", () => {
  const CHOICES = ["low", "medium", "high"] as const;

  function press(key: string): void {
    fire(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    });
  }

  function checked(): string | undefined {
    return document.querySelector<HTMLInputElement>("input[name=level]:checked")?.value;
  }

  // The recipe of docs/en/react.md: the dialog traps and names its surface.
  function Dialog({
    onClose,
    children,
  }: {
    readonly onClose: VoidFunction;
    readonly children?: ReactNode;
  }): ReactNode {
    const surface = useRef<HTMLDivElement>(null);
    useIntent(
      (event) => {
        if (event.intent !== "back") return false;
        onClose();
        return true;
      },
      { trapped: true, within: surface },
    );
    return (
      <div ref={surface} data-snav="container" data-snav-trap>
        {children}
      </div>
    );
  }

  type Within = "ref" | "getter" | "element" | "none";

  function RadioGroup({ within }: { readonly within: Within }): ReactNode {
    const group = useRef<HTMLDivElement | null>(null);
    const [element, setElement] = useState<HTMLDivElement | null>(null);
    const [at, setAt] = useState(0);
    const attach = useCallback((node: HTMLDivElement | null) => {
      group.current = node;
      setElement(node);
    }, []);
    useIntent(
      (event) => {
        if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
        const step = event.intent === "moveDown" ? 1 : -1;
        setAt((index) => Math.max(0, Math.min(CHOICES.length - 1, index + step)));
        return true;
      },
      {
        within:
          within === "ref"
            ? group
            : within === "getter"
              ? () => group.current
              : within === "element"
                ? element
                : undefined,
      },
    );
    return (
      <div role="radiogroup" ref={attach}>
        {CHOICES.map((choice, index) => (
          <label key={choice}>
            <input type="radio" name="level" value={choice} checked={index === at} readOnly />
            {choice}
          </label>
        ))}
      </div>
    );
  }

  function App({
    within,
    onClose,
  }: {
    readonly within: Within;
    readonly onClose: VoidFunction;
  }): ReactNode {
    const [open, setOpen] = useState(true);
    const plugins = useMemo(() => [spatialPlugin({ mode: "app" })], []);
    return (
      <NavProvider plugins={plugins}>
        {open ? (
          <Dialog
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          >
            <RadioGroup within={within} />
          </Dialog>
        ) : null}
      </NavProvider>
    );
  }

  for (const within of ["ref", "getter", "element"] as const) {
    it(`moves a radio group mounted with its dialog, its within given as ${within}`, async () => {
      const onClose = vi.fn();
      mount(<App within={within} onClose={onClose} />);
      await settle();

      press("ArrowDown");
      expect(checked()).toBe("medium");

      // `back` still escapes the trap and reaches the dialog.
      press("Escape");
      await settle();
      expect(onClose).toHaveBeenCalledOnce();
    });
  }

  it("keeps a radio group that names no element silenced, as before", async () => {
    mount(<App within="none" onClose={() => {}} />);
    await settle();

    press("ArrowDown");

    expect(checked()).toBe("low");
  });

  it("does not open the scope again for a within that is a new arrow on every render", async () => {
    let system: InputSystem | null = null;
    function Probe(): ReactNode {
      system = useInputSystem();
      return null;
    }
    function Composite({ tick }: { readonly tick: number }): ReactNode {
      const group = useRef<HTMLDivElement>(null);
      useIntent(() => false, { within: () => group.current });
      return <div ref={group} data-tick={tick} />;
    }
    const tree = (tick: number): ReactNode => (
      <NavProvider>
        <Probe />
        <Composite tick={tick} />
      </NavProvider>
    );
    const handle = mount(tree(0));
    await settle();
    const built = system as InputSystem | null;
    if (built === null) throw new Error("no system");
    const pushScope = vi.spyOn(built, "pushScope");

    handle.render(tree(1));
    await settle();
    handle.render(tree(2));
    await settle();

    expect(pushScope).not.toHaveBeenCalled();
  });
});

/**
 * React is the first adapter through the shared gate. Every later one passes its
 * own three functions to the same runner.
 */
const parity = (() => {
  let probe: ParityProbe | null = null;
  let handle: ReturnType<typeof mount> | null = null;
  let tree: (shape: ParityTree) => ReactNode = () => null;

  return {
    name: "react",
    mount(shape?: ParityTree | undefined): ParityProbe {
      const intents: string[] = [];
      const released: string[] = [];
      const renders: (ReturnType<typeof useInputSystem> | null)[] = [];
      let system: ReturnType<typeof useInputSystem> = null;
      let modality: InputModality = "pointer";

      // Both scopes decline, so both are asked and the order of the list is the
      // order of the stack. `trapped` is what stops the walk, not a `true` return.
      function Named({
        name,
        trapped,
        base,
        within,
        children,
      }: {
        readonly name: string;
        readonly trapped?: boolean | undefined;
        readonly base?: boolean | undefined;
        readonly within?: RefObject<HTMLDivElement | null> | undefined;
        readonly children?: ReactNode;
      }): ReactNode {
        useIntent(
          (event) => {
            intents.push(`${name}:${event.intent}`);
            return false;
          },
          { trapped, base, within },
        );
        useEffect(() => () => void released.push(name), [name]);
        return children;
      }

      function Probe(): ReactNode {
        system = useInputSystem();
        modality = useInputModality();
        renders.push(system);
        return null;
      }

      // One plugin for the life of the mount: built inside `tree`, it would be a new
      // object on every update and rebuild the system each time, and only `keymap` is
      // meant to do that.
      const plugins = [spatialPlugin()];
      // The elements belong to the tree rather than to the scope components, so they
      // stay nested when the components are siblings, and a ref is what `within` gets.
      const outerElement = createRef<HTMLDivElement>();
      const innerElement = createRef<HTMLDivElement>();
      tree = (next: ParityTree): ReactNode => {
        const inner = (next.inner ?? true) && (
          <Named
            name="inner"
            trapped={next.trapped ?? false}
            within={next.within ? innerElement : undefined}
          />
        );
        return (
          <NavProvider plugins={plugins} keymap={next.keymap}>
            <Probe />
            <div data-parity="outer" ref={outerElement}>
              <div data-parity="inner" ref={innerElement} />
            </div>
            {(next.outer ?? true) && (
              <Named
                name="outer"
                base={next.base ?? false}
                trapped={next.outerTrapped ?? false}
                within={next.within ? outerElement : undefined}
              >
                {next.nested ? inner : null}
              </Named>
            )}
            {next.nested ? null : inner}
          </NavProvider>
        );
      };

      handle = mount(tree(shape ?? {}));

      probe = {
        system: () => system,
        renders: () => renders,
        modality: () => modality,
        intents: () => intents,
        released: () => released,
      };
      return probe;
    },
    update(shape: ParityTree): void {
      handle?.render(tree(shape));
    },
    unmount(): void {
      handle?.unmount();
      handle = null;
    },
    async settle(): Promise<void> {
      await settle();
    },
    act(action: VoidFunction): void {
      fire(action);
    },
  };
})();

runAdapterParitySuite(parity);

/**
 * The risk ADR-0022 decision 5 names, and the only place it can be settled: React keeps
 * its own record of a field's value, so a programmatic mutation plus a synthetic `input`
 * event may or may not reach `onChange`. Two paths have to be checked, not one, because
 * the keyboard mutates two different ways — `setRangeText` where the field has a
 * selection, and the `value` setter where it does not.
 */
describe("the on-screen keyboard against a controlled React input", () => {
  function Controlled({
    type,
    onValue,
  }: {
    readonly type: string;
    readonly onValue: (value: string) => void;
  }): ReactNode {
    const [value, setValue] = useState("");
    useEffect(() => {
      onValue(value);
    }, [value, onValue]);
    return (
      <input
        data-testid="controlled"
        type={type}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    );
  }

  async function typeOneKey(type: string): Promise<{
    readonly domValue: string;
    readonly stateValue: string | undefined;
  }> {
    const seen: string[] = [];
    const keyboard = keyboardPlugin({ layout: alphabetic, openOn: "focus" });
    const handle = mount(
      <NavProvider plugins={[keyboard]}>
        <Controlled type={type} onValue={(value) => seen.push(value)} />
      </NavProvider>,
    );
    await settle();

    const field = handle.container.querySelector("input") as HTMLInputElement;
    fire(() => field.focus());
    await settle();

    const key = document.querySelector<HTMLButtonElement>("[data-snav-keyboard] button");
    if (key === null) throw new Error("the keyboard did not open");
    fire(() => key.click());
    await settle();

    return { domValue: field.value, stateValue: seen[seen.length - 1] };
  }

  it("reaches onChange through setRangeText, on a field with a selection", async () => {
    const { domValue, stateValue } = await typeOneKey("text");

    expect(domValue).toBe("a");
    // `setRangeText` does not go through the `value` setter React instruments, so React's
    // record still holds the old value when the synthetic `input` arrives and the change
    // is seen. This is the path almost every field takes.
    expect(stateValue).toBe("a");
  });

  it("reaches onChange on a field with no selection, where the value setter is used", async () => {
    const { domValue, stateValue } = await typeOneKey("email");

    expect(domValue).toBe("a");
    // The riskier path, and it did fail: `email` exposes no selection, so the keyboard
    // assigns `value` — the very property React instruments on the instance. React's
    // record was updated before the event arrived, it concluded nothing had changed, and
    // the next render put the empty value back, so the field visibly rejected the key.
    // `assignValue` in the keyboard now goes through the prototype's setter, which leaves
    // that record stale. This test is what found it and what keeps it fixed.
    expect(stateValue).toBe("a");
  });

  it("mirrors a field that transforms what was typed, caret back at the end", async () => {
    function Uppercased(): ReactNode {
      const [value, setValue] = useState("ab");
      return (
        <input
          data-testid="uppercased"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase())}
        />
      );
    }
    const keyboard = keyboardPlugin({ layout: alphabetic, openOn: "focus" });
    mount(
      <NavProvider plugins={[keyboard]}>
        <Uppercased />
      </NavProvider>,
    );
    await settle();
    const field = document.querySelector<HTMLInputElement>("[data-testid=uppercased]");
    if (field === null) throw new Error("no field");
    fire(() => field.focus());
    await settle();
    const row = document.querySelector<HTMLElement>("[data-snav-keyboard-preview]");
    const key = document.querySelector<HTMLButtonElement>("[data-snav-keyboard] button");
    if (row === null || key === null) throw new Error("the keyboard did not open");

    // The caret moved to 1 from the preview row, then "a" is typed there.
    fire(() => row.focus());
    fire(() =>
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })),
    );
    fire(() => key.click());
    await settle();

    // React re-assigns the transformed value to a field that is not focused, and that
    // assignment puts the caret at the end. The row mirrors the field as it ends up —
    // not where the keyboard left the caret — which is the point of reading it back.
    expect({ value: field.value, caret: field.selectionStart, shown: row.textContent }).toEqual({
      value: "AAB",
      caret: 3,
      shown: "AAB",
    });
  });
});

describe("the native answer through the adapter (ADR-0026)", () => {
  function checked(): string | undefined {
    return document.querySelector<HTMLInputElement>("input[name=size]:checked")?.value;
  }

  // The recipe of docs/en/react.md: native radios in app mode keep their own axis.
  function Sizes(): ReactNode {
    const group = useRef<HTMLDivElement>(null);
    useIntent(
      (event) =>
        event.source === "keyboard" &&
        (event.intent === "moveUp" || event.intent === "moveDown") &&
        group.current?.contains(document.activeElement) === true
          ? "native"
          : false,
      { within: group },
    );
    return (
      <div role="radiogroup" ref={group}>
        {["s", "m", "l"].map((size) => (
          <label key={size} style={{ display: "block" }}>
            <input type="radio" name="size" value={size} defaultChecked={size === "s"} />
            {size}
          </label>
        ))}
      </div>
    );
  }

  it("lets a real ArrowDown check the next radio through useIntent", async () => {
    const plugins = [spatialPlugin({ mode: "app" })];
    mount(
      <NavProvider plugins={plugins}>
        <Sizes />
        <button type="button">after</button>
      </NavProvider>,
    );
    await settle();
    document.querySelector<HTMLInputElement>("input[value=s]")?.focus();

    await userEvent.keyboard("{ArrowDown}");

    expect(checked()).toBe("m");
    expect((document.activeElement as HTMLInputElement | null)?.value).toBe("m");
  });

  it("hands a host scope's native answer back unchanged", async () => {
    let host: ReturnType<typeof useIntentScopeHost> = null;
    function Probe(): ReactNode {
      host = useIntentScopeHost();
      return null;
    }
    const plugins = [spatialPlugin({ mode: "app" })];
    mount(
      <NavProvider plugins={plugins}>
        <Probe />
        <button type="button" id="first">
          first
        </button>
        <button type="button" id="second">
          second
        </button>
      </NavProvider>,
    );
    await settle();
    const opened = host as ReturnType<typeof useIntentScopeHost>;
    if (opened === null) throw new Error("no host");
    const dispose = opened.pushScope(() => "native");
    document.querySelector<HTMLElement>("#first")?.focus();

    // The two buttons sit side by side, so without the answer the engine would move right.
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    fire(() => document.dispatchEvent(event));
    dispose();

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement?.id).toBe("first");
  });
});
