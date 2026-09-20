import { type ReactNode, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ParityProbe, type ParityTree, runAdapterParitySuite } from "../adapter-parity";
import { keyboardPlugin } from "../keyboard/keyboard";
import { alphabetic } from "../keyboard/layouts/alphabetic";
import { spatialPlugin } from "../spatial/spatial";
import type { InputModality } from "../types";
import { NavProvider, useInputModality, useInputSystem, useIntent } from "./react";
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
      }: {
        readonly name: string;
        readonly trapped?: boolean | undefined;
        readonly base?: boolean | undefined;
      }): ReactNode {
        useIntent(
          (event) => {
            intents.push(`${name}:${event.intent}`);
            return false;
          },
          { trapped, base },
        );
        useEffect(() => () => void released.push(name), [name]);
        return null;
      }

      function Probe(): ReactNode {
        system = useInputSystem();
        modality = useInputModality();
        renders.push(system);
        return null;
      }

      // The provider lives outside the shape, so an update re-renders the scopes
      // without ever rebuilding the system underneath them.
      tree = (next: ParityTree): ReactNode => (
        <NavProvider plugins={[spatialPlugin()]}>
          <Probe />
          <Named name="outer" base={next.base ?? false} />
          {(next.inner ?? true) && <Named name="inner" trapped={next.trapped ?? false} />}
        </NavProvider>
      );

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
});
