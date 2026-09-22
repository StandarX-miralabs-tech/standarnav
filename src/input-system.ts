/**
 * One instance per application, never a global singleton — micro-frontends and tests
 * both need two of these to coexist.
 *
 * The system owns the keyboard source and the scope stack; everything else arrives as
 * a plugin. A plugin factory returns a handle that *is* both the plugin and its API,
 * so `gamepadPlugin()` can be held in a variable and called on directly. That is why
 * there is no `input.gamepad` accessor and no name-keyed registry: neither could be
 * typed without a cast, and a cast in the public surface of a headless library is a
 * bug waiting for a consumer to find it.
 */

import { addDomEvent, isComposingEvent } from "./dom/event";
import { getEventTarget, isHTMLElement } from "./dom/query";
import {
  createIntentBus,
  createIntentEvent,
  type IntentBus,
  type IntentDispatch,
  type IntentHandler,
  type IntentInit,
  type IntentScopeOptions,
} from "./intent-bus";
import {
  isIntentAllowedInTextEntry,
  isTextEntryTarget,
  type KeymapOverrides,
  resolveKeyIntent,
} from "./keymap";
import { getInputModality, setInputModality, trackInputModality } from "./modality";
import type { InputModality, IntentEvent } from "./types";

export interface InputPluginContext {
  readonly doc: Document;
  readonly bus: IntentBus;
  emit(init: IntentInit): IntentDispatch;
  setModality(modality: InputModality): void;
  getModality(): InputModality;
}

export interface InputPlugin {
  readonly name: string;
  setup(context: InputPluginContext): VoidFunction;
  /** Optional, and the reason `pause()` is more than "stop dispatching": a polling
   * engine has to actually stop polling. */
  pause?(): void;
  resume?(): void;
}

export interface InputSystemOptions {
  readonly doc?: Document | undefined;
  readonly plugins?: readonly InputPlugin[] | undefined;
  readonly keymap?: KeymapOverrides | undefined;
  /** Lets ArrowUp/Down and PageUp/Down out of a text field. Off by default. */
  readonly allowVerticalInText?: boolean | undefined;
}

export interface InputSystem {
  readonly modality: InputModality;
  pushScope(handler: IntentHandler, options?: IntentScopeOptions | undefined): VoidFunction;
  /** Injects an intent as if a source had produced it — how the plugins publish. */
  emit(init: IntentInit): IntentDispatch;
  onIntent(listener: (event: IntentEvent) => void): VoidFunction;
  onModalityChange(listener: (modality: InputModality) => void): VoidFunction;
  pause(): void;
  resume(): void;
  destroy(): void;
}

/**
 * Runs every teardown whatever any one of them does, in reverse order because a
 * plugin set up last may hold something an earlier one owns. An unguarded loop lets
 * one broken plugin strand the listeners of every other, which is the one failure a
 * teardown must not have.
 */
function unwind(teardowns: VoidFunction[]): unknown[] {
  const failures: unknown[] = [];
  for (const teardown of teardowns.reverse()) {
    try {
      teardown();
    } catch (error) {
      failures.push(error);
    }
  }
  teardowns.length = 0;
  return failures;
}

export function createInputSystem(options: InputSystemOptions = {}): InputSystem {
  const doc = options.doc ?? globalThis.document;
  // Typed as always present by lib.dom and absent for real on a server, which is
  // the whole point of the check.
  if (doc === undefined) {
    throw new Error(
      "createInputSystem needs a document — call it from an effect, not during render or on the server",
    );
  }

  const bus = createIntentBus();
  const allowVerticalInText = options.allowVerticalInText === true;
  const intentListeners = new Set<(event: IntentEvent) => void>();
  const modalityListeners = new Set<(modality: InputModality) => void>();
  const teardowns: VoidFunction[] = [];
  const plugins = options.plugins ?? [];

  let paused = false;
  let destroyed = false;

  /**
   * The browser turns Enter and Space into a click; nothing does that for a
   * gamepad. So an activation no scope claimed lands on the focused element,
   * which is what makes A work on a button, a checkbox, a radio and a segment
   * without a single component knowing a pad exists.
   *
   * Only when unclaimed, only from a source that has no native click of its own,
   * and never into a text field — where A belongs to the virtual keyboard.
   */
  const activateFocused = (init: IntentInit, result: IntentDispatch): void => {
    if (
      init.intent !== "select" ||
      init.repeat === true ||
      result.consumed ||
      result.defaultPrevented ||
      // The browser is already producing a click for this one; acting here too
      // would fire the control twice.
      init.source === "keyboard"
    ) {
      return;
    }
    const active = doc.activeElement;
    if (isHTMLElement(active) && !isTextEntryTarget(active)) active.click();
  };

  const emit = (init: IntentInit): IntentDispatch => {
    if (paused || destroyed) {
      return { consumed: false, defaultPrevented: false, event: createIntentEvent(init) };
    }
    const result = bus.dispatch(init);
    // Observers get the very event the scopes saw. A `preventDefault` after the walk
    // has finished does nothing, which is exactly what a DOM event does too.
    for (const listener of [...intentListeners]) listener(result.event);
    activateFocused(init, result);
    return result;
  };

  teardowns.push(
    trackInputModality(doc, (modality) => {
      for (const listener of [...modalityListeners]) listener(modality);
    }),
  );

  teardowns.push(
    addDomEvent(
      doc,
      "keydown",
      (event: KeyboardEvent) => {
        if (paused) return;
        // A keydown mid-composition belongs to the IME: Enter is confirming a
        // candidate, not activating anything.
        if (isComposingEvent(event)) return;
        const resolved = resolveKeyIntent(event, options.keymap);
        if (resolved === null) return;
        // An activation is never repeated: holding Enter must not fire a button ten
        // times, and the gamepad engine makes the same promise.
        if (resolved.intent === "select" && event.repeat) return;
        if (
          isTextEntryTarget(getEventTarget(event)) &&
          !isIntentAllowedInTextEntry(resolved.intent, allowVerticalInText)
        ) {
          return;
        }

        const result = emit({
          intent: resolved.intent,
          source: resolved.source,
          repeat: event.repeat,
          originalEvent: event,
        });
        // The native default survives unless someone actually wanted the intent —
        // otherwise arrow keys would stop scrolling a page that has no navigation.
        if (result.consumed || result.defaultPrevented) event.preventDefault();
      },
      // Capture, and after the modality tracker registered just above: a scope has
      // to be able to claim a key before the focused component reacts to it.
      { capture: true },
    ),
  );

  const context: InputPluginContext = {
    doc,
    bus,
    emit,
    setModality: (modality: InputModality): void => setInputModality(doc, modality),
    getModality: (): InputModality => getInputModality(doc),
  };

  try {
    for (const plugin of plugins) teardowns.push(plugin.setup(context));
  } catch (error) {
    // The modality tracker and the capture keydown listener are installed by now,
    // and a throwing setup leaves the caller with no system to call destroy() on.
    // Any failure from the unwind is dropped on purpose: this error is the cause.
    unwind(teardowns);
    throw error;
  }

  return {
    get modality(): InputModality {
      return getInputModality(doc);
    },

    pushScope: (handler, scopeOptions): VoidFunction => bus.pushScope(handler, scopeOptions),
    emit,

    onIntent(listener): VoidFunction {
      intentListeners.add(listener);
      return () => intentListeners.delete(listener);
    },

    onModalityChange(listener): VoidFunction {
      modalityListeners.add(listener);
      return () => modalityListeners.delete(listener);
    },

    pause(): void {
      if (paused) return;
      paused = true;
      for (const plugin of plugins) plugin.pause?.();
    },

    resume(): void {
      if (!paused) return;
      paused = false;
      for (const plugin of plugins) plugin.resume?.();
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      const failures = unwind(teardowns);
      intentListeners.clear();
      modalityListeners.clear();
      // Everything is down before this surfaces, so the caller still learns that a
      // plugin misbehaved.
      if (failures.length > 0) throw failures[0];
    },
  };
}
