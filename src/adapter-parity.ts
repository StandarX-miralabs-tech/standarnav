/**
 * The behaviours every adapter must reproduce, as one callable runner rather than
 * a file to copy. ADR-0018 decision 5 and specification R36 make it the ship gate:
 * an adapter that does not pass this does not ship. React first, then vanilla, Vue,
 * Svelte, Angular.
 *
 * A suite that is not callable on day one gets copy-pasted per adapter within a
 * month, and five divergent copies of a gate are not a gate. So an adapter passes
 * in the three things only it can provide — how to mount a tree with a provider
 * above it, how to unmount, and how to flush — and everything below is framework
 * agnostic.
 *
 * Test-only. No entry point references it, so nothing here ships.
 */

import { describe, expect, it, vi } from "vitest";
import type { InputSystem } from "./input-system";
import type { IntentHandler } from "./intent-bus";
import type { InputModality } from "./types";

export interface ParityProbe {
  /** The system the provider built, or `null` before its effect has run. */
  system(): InputSystem | null;
  /** What the system was on each render pass, oldest first. */
  renders(): readonly (InputSystem | null)[];
  /** What `useInputModality` and its equivalents currently report. */
  modality(): InputModality;
  /** Intents that reached the scope this tree pushed, in order. */
  intents(): readonly string[];
  /** Scopes released as the adapter tore the tree down, in whatever order. */
  released(): readonly string[];
}

export interface ParityAdapter {
  readonly name: string;
  /**
   * Mounts a provider with two nested scopes named "outer" and "inner", pushing
   * them in that order, and returns a probe over the result.
   */
  mount(): ParityProbe;
  unmount(): void;
  /** Lets the framework commit whatever is pending. */
  settle(): Promise<void>;
  /** Runs `action` inside whatever batching the framework needs. */
  act(action: VoidFunction): void;
}

function press(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

export function runAdapterParitySuite(adapter: ParityAdapter): void {
  describe(`adapter parity — ${adapter.name}`, () => {
    it("builds exactly one system, and not during the first render", async () => {
      const probe = adapter.mount();
      await adapter.settle();

      // The first render pass must see nothing: that is the server's answer too,
      // and an adapter that builds a system during render touches a document
      // that may not exist. Asserted over the recorded passes rather than by
      // reading the probe before flushing — a harness that mounts inside its own
      // batching has already run the effects by the time mount() returns.
      expect(probe.renders()[0] ?? null).toBeNull();

      const built = probe.system();
      expect(built).not.toBeNull();

      await adapter.settle();
      // And it is the same one throughout: a rebuild per commit is the identity
      // bug every adapter writes once, and it churns the modality refcount
      // between one and zero, at which point the tracker disposes.
      expect(probe.system()).toBe(built);
      expect(new Set(probe.renders().filter((seen) => seen !== null)).size).toBe(1);

      adapter.unmount();
    });

    it("delivers an intent to the scope the tree pushed", async () => {
      const probe = adapter.mount();
      await adapter.settle();

      adapter.act(() => press("ArrowDown"));

      expect(probe.intents()).toEqual(["moveDown"]);
      adapter.unmount();
    });

    it("asks the innermost scope first", async () => {
      const probe = adapter.mount();
      await adapter.settle();

      adapter.act(() => press("ArrowDown"));

      // The suite's mount pushes "outer" then "inner"; the stack is LIFO, and an
      // adapter that re-pushes on re-render silently reverses this.
      expect(probe.intents()[0]).toBe("moveDown");
      expect(probe.released()).toEqual([]);
      adapter.unmount();
    });

    it("releases every scope it pushed on unmount", async () => {
      const probe = adapter.mount();
      await adapter.settle();

      adapter.unmount();

      // Every one, and the order is deliberately not asserted. ADR-0018 asked
      // for LIFO; React tears down parent-first, and it makes no difference,
      // because the bus removes a scope by identity (indexOf then splice) rather
      // than by position. Requiring an order here would fail every adapter for
      // something unobservable and would say nothing about a real leak.
      expect([...probe.released()].sort()).toEqual(["inner", "outer"]);
    });

    it("reports the document's modality", async () => {
      const probe = adapter.mount();
      await adapter.settle();

      adapter.act(() => press("Tab"));
      expect(probe.modality()).toBe("keyboard");

      adapter.act(() => {
        document.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
        );
      });
      expect(probe.modality()).toBe("pointer");

      adapter.unmount();
    });

    it("leaves nothing listening after unmount", async () => {
      const probe = adapter.mount();
      await adapter.settle();
      adapter.unmount();

      const before = probe.intents().length;
      press("ArrowDown");

      expect(probe.intents()).toHaveLength(before);
      // The modality attribute goes with the last subscriber, so a leaked
      // tracker shows up here rather than as a slow leak nobody attributes.
      expect(document.documentElement.hasAttribute("data-snav-input")).toBe(false);
    });

    it("survives a scope disposed after the provider has already been destroyed", async () => {
      // Pinned explicitly because it is safe today only by accident: destroy()
      // never touches the bus's scopes array, so a descendant disposing
      // afterwards splices from an array nothing will ever dispatch to. A core
      // that cleared the bus on destroy, or threw on a double dispose, would
      // break every unmount in every adapter and nothing else here would say so.
      const probe = adapter.mount();
      await adapter.settle();
      const system = probe.system();
      expect(system).not.toBeNull();

      const handler: IntentHandler = vi.fn();
      const dispose = system?.pushScope(handler);
      system?.destroy();

      expect(() => dispose?.()).not.toThrow();
      expect(() => dispose?.()).not.toThrow();
      adapter.unmount();
    });
  });
}
