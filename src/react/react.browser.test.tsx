import { type ReactNode, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ParityProbe, runAdapterParitySuite } from "../adapter-parity";
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

  return {
    name: "react",
    mount(): ParityProbe {
      const intents: string[] = [];
      const released: string[] = [];
      const renders: (ReturnType<typeof useInputSystem> | null)[] = [];
      let system: ReturnType<typeof useInputSystem> = null;
      let modality: InputModality = "pointer";

      function Named({ name }: { readonly name: string }): ReactNode {
        useIntent((event) => {
          if (name === "inner") intents.push(event.intent);
          return name === "inner";
        });
        useEffect(() => () => void released.push(name), [name]);
        return null;
      }

      function Probe(): ReactNode {
        system = useInputSystem();
        modality = useInputModality();
        renders.push(system);
        return null;
      }

      handle = mount(
        <NavProvider plugins={[spatialPlugin()]}>
          <Probe />
          <Named name="outer" />
          <Named name="inner" />
        </NavProvider>,
      );

      probe = {
        system: () => system,
        renders: () => renders,
        modality: () => modality,
        intents: () => intents,
        released: () => released,
      };
      return probe;
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
