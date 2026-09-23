/**
 * The stack every source dispatches into, and the reason a keyboard and a gamepad
 * are indistinguishable downstream.
 *
 * The top scope is asked first and `true` ends the walk. A machine pushes its scope
 * when it opens and pops it when it closes, so an open menu captures the arrows by
 * simply existing — nothing has to know a menu might be open.
 *
 * `trapped` is the modal case: the scope swallows what it did not handle so nothing
 * underneath sees it. Three intents escape a trap anyway. `back` must, or a modal
 * would be impossible to leave. `tabNext`/`tabPrev` must because Tab in a dialog is
 * the focus trap's business — a trap that consumed them would call `preventDefault`
 * on the native Tab and freeze the focus inside the dialog on its first element.
 *
 * `base` is the other side of that coin, and the dialog is why it exists. A trap
 * swallowing every direction is right about the *page* and wrong about the surface:
 * the spatial engine is pushed at setup, so it sits at the very bottom, and a modal
 * that hid the directions from it made its own interior unreachable to a d-pad. A
 * `base` scope is asked even through a trap. It is safe to ask because the engine
 * confines itself to the trapping surface on its own — `data-snav-trap`, plus the
 * `inert` the dialog puts on everything else — so what it moves is the focus
 * *inside* the modal, which is exactly what a trap should never have blocked.
 *
 * `within` is the same argument made for a component, and it is opt-in (ADR-0025).
 * A trap only knows the order scopes were pushed in, and a framework opens a child's
 * scope before its parent's: a radio group mounted with the dialog around it is
 * pushed first and lands *under* that dialog's trap, which then silenced its own
 * content. A trap that names its surface as `within` still asks every scope beneath
 * it whose own `within` lies inside that surface. What sits outside it, or names no
 * element, stays silenced exactly as before, and a trap naming no surface is the
 * trap it always was. The stack is not reordered: a contained scope beneath the
 * trap is asked after it.
 */

import type { IntentEvent, IntentSource, NavigationIntent } from "./types";

// `void`, not `undefined`: a handler written with a statement body and no return
// is the common case, and the rule's suggested fix rejects every one of them.
// biome-ignore lint/suspicious/noConfusingVoidType: the union is the contract.
export type IntentHandler = (event: IntentEvent) => boolean | void;

export interface IntentScopeOptions {
  readonly trapped?: boolean | undefined;
  /**
   * A last-resort scope, still asked once a trap above has swallowed the intent.
   * For the engine that navigates *within* whatever surface is trapping. A component
   * is what a trap silences, unless it sits inside the trapping surface and both say
   * so through `within` — `base` would let it through every trap, its own or not.
   */
  readonly base?: boolean | undefined;
  /**
   * The element this scope belongs to, or a getter read at each dispatch — an adapter
   * only has the element after its first commit. On a trap it names the surface: a
   * scope beneath the trap is still asked when its own `within` is inside that
   * surface, the surface itself included. A getter answering nothing means no element.
   */
  readonly within?: Element | (() => Element | null | undefined) | null | undefined;
}

export interface IntentInit {
  readonly intent: NavigationIntent;
  readonly source: IntentSource;
  readonly repeat?: boolean | undefined;
  readonly value?: number | undefined;
  readonly originalEvent?: Event | null | undefined;
}

export interface IntentDispatch {
  /** A scope claimed the intent — the native default is the caller's to suppress. */
  readonly consumed: boolean;
  readonly defaultPrevented: boolean;
  /** The event as the scopes saw it, for whoever only wants to watch. */
  readonly event: IntentEvent;
}

/**
 * Anything a scope can be pushed onto. `InputSystem` forwards `pushScope` without
 * being a bus, and a consumer holding one should not have to reach past it — so
 * everything that only opens scopes, engage mode included, asks for this.
 */
export interface IntentScopeHost {
  pushScope(handler: IntentHandler, options?: IntentScopeOptions | undefined): VoidFunction;
}

export interface IntentBus extends IntentScopeHost {
  dispatch(init: IntentInit): IntentDispatch;
  /** Open scopes, deepest last. Exposed so a teardown can be asserted. */
  depth(): number;
}

export function createIntentEvent(init: IntentInit): IntentEvent {
  let prevented = false;
  return {
    intent: init.intent,
    source: init.source,
    repeat: init.repeat ?? false,
    value: init.value,
    originalEvent: init.originalEvent ?? null,
    get defaultPrevented(): boolean {
      return prevented;
    },
    preventDefault(): void {
      prevented = true;
    },
  };
}

const TRAP_ESCAPES: ReadonlySet<NavigationIntent> = new Set<NavigationIntent>([
  "back",
  "tabNext",
  "tabPrev",
]);

interface Scope {
  readonly handler: IntentHandler;
  readonly trapped: boolean;
  readonly base: boolean;
  readonly within: IntentScopeOptions["within"];
  disposed: boolean;
}

function resolve(within: IntentScopeOptions["within"]): Element | null {
  return (typeof within === "function" ? within() : within) ?? null;
}

export function createIntentBus(): IntentBus {
  const scopes: Scope[] = [];

  return {
    pushScope(handler, options): VoidFunction {
      const scope: Scope = {
        handler,
        trapped: options?.trapped === true,
        base: options?.base === true,
        within: options?.within,
        disposed: false,
      };
      scopes.push(scope);

      return () => {
        if (scope.disposed) return;
        scope.disposed = true;
        const index = scopes.indexOf(scope);
        if (index !== -1) scopes.splice(index, 1);
      };
    },

    dispatch(init): IntentDispatch {
      const event = createIntentEvent(init);
      // A handler is allowed to open or close a scope while it runs — a menu item
      // that opens a submenu does exactly that. Walk a snapshot, and skip whatever
      // was disposed on the way down.
      const snapshot = [...scopes];
      let trapped = false;
      let surface: Element | null = null;
      for (let index = snapshot.length - 1; index >= 0; index--) {
        const scope = snapshot[index];
        if (scope === undefined || scope.disposed) continue;
        // Past a trap only the last-resort scopes and what lies inside the trapping
        // surface are still asked: the walk goes on so the spatial engine can move the
        // focus inside the modal, and so a composite the dialog holds — pushed before
        // the dialog, as a child is — still answers. Everything else stays silenced.
        if (trapped && !scope.base && !surface?.contains(resolve(scope.within))) continue;
        if (scope.handler(event) === true) {
          return { consumed: true, defaultPrevented: true, event };
        }
        // Every trap asked sets the surface. Beneath the first, a component trap is only
        // asked when it lies inside the surface, so a dialog nested in another narrows it.
        if (scope.trapped && !TRAP_ESCAPES.has(event.intent)) {
          trapped = true;
          surface = resolve(scope.within);
        }
      }
      // A trap nobody answered still swallows — that is what makes it a trap.
      if (trapped) return { consumed: true, defaultPrevented: true, event };
      return { consumed: false, defaultPrevented: event.defaultPrevented, event };
    },

    depth: (): number => scopes.length,
  };
}
