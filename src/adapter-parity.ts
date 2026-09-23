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
import type { KeymapOverrides } from "./keymap";
import type { InputModality } from "./types";

export interface ParityProbe {
  /** The system the provider built, or `null` before its effect has run. */
  system(): InputSystem | null;
  /** What the system was on each render pass, oldest first. */
  renders(): readonly (InputSystem | null)[];
  /** What `useInputModality` and its equivalents currently report. */
  modality(): InputModality;
  /**
   * Intents that reached the tree's scopes, in the order the stack asked them,
   * each tagged with the scope that saw it — `"inner:moveDown"`. Both scopes
   * decline every intent, so what reaches a scope is observable rather than
   * swallowed, and the order of this list is the order of the stack.
   */
  intents(): readonly string[];
  /**
   * Scope components whose cleanup ran as the adapter tore the tree down. This
   * proves the adapter runs its own teardown, and nothing more: a cleanup that
   * forgot to call the disposer would still be recorded here. The scope actually
   * leaving the bus is asserted by the subtree case below, which is observable.
   */
  released(): readonly string[];
}

/**
 * The shape of the mounted tree. Every field has a default, so an adapter that
 * only ever renders the default shape still satisfies the older cases.
 */
export interface ParityTree {
  /**
   * Whether the outer scope's component is mounted at all. Defaults to `true`. Mounting
   * it after "inner" is the one way this tree has to open its scopes in an order other
   * than the order they are declared in.
   */
  readonly outer?: boolean | undefined;
  /** Whether the inner scope's component is mounted at all. Defaults to `true`. */
  readonly inner?: boolean | undefined;
  /** `trapped` on the inner scope. Defaults to `false`. */
  readonly trapped?: boolean | undefined;
  /** `base` on the outer scope. Defaults to `false`. */
  readonly base?: boolean | undefined;
  /**
   * `trapped` on the outer scope. Defaults to `false`. With `nested`, this is the dialog
   * and "inner" the composite inside it.
   */
  readonly outerTrapped?: boolean | undefined;
  /**
   * Whether the inner scope's component is rendered inside the outer scope's component
   * rather than beside it. Defaults to `false`. Nested, both mount in one commit and a
   * framework runs the child's effect first, so "inner" is opened first and sits under
   * "outer" — the order a composite inside a dialog really gets.
   */
  readonly nested?: boolean | undefined;
  /**
   * Whether each scope passes its own element as `within`. Defaults to `false`, which is
   * how every scope was opened before ADR-0025, and has to keep behaving that way.
   */
  readonly within?: boolean | undefined;
  /**
   * Forwarded to the provider. Defaults to none. A different value is the portable way
   * to make the provider build a new system under scopes that stay mounted.
   */
  readonly keymap?: KeymapOverrides | undefined;
}

export interface ParityAdapter {
  readonly name: string;
  /**
   * Mounts a provider with two scopes named "outer" and "inner" and returns a probe over
   * the result. Both handlers record what they are asked and then decline it. Each scope
   * has an element of its own, inner's inside outer's, whatever the shape: that nesting
   * is what `within` is answered against. Unless `nested`, the two scope components are
   * siblings and push "outer" then "inner".
   */
  mount(tree?: ParityTree | undefined): ParityProbe;
  /**
   * Re-renders the tree already mounted with a different shape — no remount, no new
   * provider, and a new system only when `keymap` changed. This is what makes "the
   * scope was re-registered" and "the scope left the bus" observable at all.
   */
  update(tree: ParityTree): void;
  unmount(): void;
  /** Lets the framework commit whatever is pending. */
  settle(): Promise<void>;
  /** Runs `action` inside whatever batching the framework needs. */
  act(action: VoidFunction): void;
}

const REMAPPED: KeymapOverrides = { keys: { w: "moveUp" } };

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

    it("delivers an intent to the scopes the tree pushed", async () => {
      const probe = adapter.mount();
      await adapter.settle();

      adapter.act(() => press("ArrowDown"));

      expect(probe.intents()).toContain("inner:moveDown");
      adapter.unmount();
    });

    it("asks the innermost scope first", async () => {
      const probe = adapter.mount();
      await adapter.settle();

      adapter.act(() => press("ArrowDown"));

      // The suite's mount pushes "outer" then "inner"; the stack is LIFO, and an
      // adapter that re-pushes on re-render silently reverses this. Both scopes
      // decline, so both are asked and the order is the assertion — reading only
      // the first entry, or recording only one scope, asserts nothing about order.
      expect(probe.intents()).toEqual(["inner:moveDown", "outer:moveDown"]);
      expect(probe.released()).toEqual([]);
      adapter.unmount();
    });

    it("releases a scope when its own subtree unmounts, with the tree still up", async () => {
      const probe = adapter.mount();
      await adapter.settle();
      adapter.act(() => press("ArrowDown"));
      expect(probe.intents()).toEqual(["inner:moveDown", "outer:moveDown"]);

      adapter.update({ inner: false });
      await adapter.settle();
      adapter.act(() => press("ArrowDown"));

      // The scope is gone from the bus, not merely unrendered. A cleanup that
      // dropped the component without calling its disposer leaves "inner" in this
      // list a second time, and a leak that no unmount-counting test can see.
      expect(probe.intents()).toEqual(["inner:moveDown", "outer:moveDown", "outer:moveDown"]);
      adapter.unmount();
    });

    it("keeps a trap from reaching the scope beneath it", async () => {
      const probe = adapter.mount({ trapped: true });
      await adapter.settle();

      adapter.act(() => press("ArrowDown"));

      // "inner" declines, but it traps, so the stack stops there.
      expect(probe.intents()).toEqual(["inner:moveDown"]);
      adapter.unmount();
    });

    it("asks a base scope even through a trap above it", async () => {
      const probe = adapter.mount({ trapped: true, base: true });
      await adapter.settle();

      adapter.act(() => press("ArrowDown"));

      // The whole point of `base`: the engine that navigates *inside* the trapping
      // surface is still asked. An adapter that accepts `base` and drops it on the
      // floor passes every other case in this file.
      expect(probe.intents()).toEqual(["inner:moveDown", "outer:moveDown"]);
      adapter.unmount();
    });

    it("asks a composite nested in a trapping surface when both pass their element", async () => {
      const probe = adapter.mount({ nested: true, outerTrapped: true, within: true });
      await adapter.settle();

      adapter.act(() => press("ArrowDown"));

      // Mounted in one commit, "inner" was opened first and sits under the trap. Its
      // element is inside the trap's, so it is asked — after the trap, because
      // containment does not reorder the stack (ADR-0025).
      expect(probe.intents()).toEqual(["outer:moveDown", "inner:moveDown"]);
      adapter.unmount();
    });

    it("keeps silencing that composite when neither scope passes its element", async () => {
      const probe = adapter.mount({ nested: true, outerTrapped: true });
      await adapter.settle();

      adapter.act(() => press("ArrowDown"));

      // `within` is opt-in. An adapter that confined every trap to its component's
      // element on its own would pass the case above and change every existing dialog.
      expect(probe.intents()).toEqual(["outer:moveDown"]);
      adapter.unmount();
    });

    it("re-registers a scope when its base changes on a rerender", async () => {
      const probe = adapter.mount({ trapped: true, base: false });
      await adapter.settle();
      adapter.act(() => press("ArrowDown"));
      expect(probe.intents()).toEqual(["inner:moveDown"]);

      adapter.update({ trapped: true, base: true });
      await adapter.settle();
      adapter.act(() => press("ArrowDown"));

      // Forwarding `base` on mount and ignoring it on update is the shape of bug
      // that only shows up once a dialog changes its mind.
      expect(probe.intents()).toEqual(["inner:moveDown", "inner:moveDown", "outer:moveDown"]);
      adapter.unmount();
    });

    it("keeps open order across a system rebuild", async () => {
      const probe = adapter.mount();
      await adapter.settle();
      adapter.act(() => press("ArrowDown"));
      expect(probe.intents()).toEqual(["inner:moveDown", "outer:moveDown"]);
      const before = probe.system();

      adapter.update({ keymap: REMAPPED });
      await adapter.settle();

      // A new system, or this case proves nothing: what answers below is what the
      // adapter re-opened on it.
      expect(probe.system()).not.toBeNull();
      expect(probe.system()).not.toBe(before);
      adapter.act(() => press("ArrowDown"));
      expect(probe.intents()).toEqual([
        "inner:moveDown",
        "outer:moveDown",
        "inner:moveDown",
        "outer:moveDown",
      ]);
      adapter.unmount();
    });

    it("keeps a scope opened late above one declared after it, across a system rebuild", async () => {
      const probe = adapter.mount({ outer: false });
      await adapter.settle();
      adapter.update({});
      await adapter.settle();
      adapter.act(() => press("ArrowDown"));
      // "outer" is declared first and opened last, so it is asked first.
      expect(probe.intents()).toEqual(["outer:moveDown", "inner:moveDown"]);
      const before = probe.system();

      adapter.update({ keymap: REMAPPED });
      await adapter.settle();

      // An adapter that re-opens its scopes in the order they are declared, rather than
      // the order they were opened in, puts "inner" back on top here.
      expect(probe.system()).not.toBe(before);
      adapter.act(() => press("ArrowDown"));
      expect(probe.intents()).toEqual([
        "outer:moveDown",
        "inner:moveDown",
        "outer:moveDown",
        "inner:moveDown",
      ]);
      adapter.unmount();
    });

    it("keeps a scope opened above a trap above it, across a system rebuild", async () => {
      const probe = adapter.mount({ outer: false, trapped: true });
      await adapter.settle();
      adapter.update({ trapped: true });
      await adapter.settle();
      adapter.act(() => press("ArrowDown"));
      expect(probe.intents()).toEqual(["outer:moveDown", "inner:moveDown"]);
      const before = probe.system();

      adapter.update({ trapped: true, keymap: REMAPPED });
      await adapter.settle();

      // Re-opened in declaration order, the trap lands on top and silences the scope
      // that was opened over it — a menu opened over a dialog, dead after a rebuild.
      expect(probe.system()).not.toBe(before);
      adapter.act(() => press("ArrowDown"));
      expect(probe.intents()).toEqual([
        "outer:moveDown",
        "inner:moveDown",
        "outer:moveDown",
        "inner:moveDown",
      ]);
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
