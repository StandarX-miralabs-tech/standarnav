/**
 * The gamepad engine — opt-in, and zero bytes in an application that never imports it.
 *
 * The Gamepad API is still polling-only: no browser fires an event when a button
 * changes, and the event-driven proposal is an explainer, not an implementation. So
 * this is a `requestAnimationFrame` loop, and the whole design is about it costing
 * nothing when it is not earning anything. It runs only while a pad is connected, the
 * document is visible and the system is neither paused nor destroyed; it stops itself
 * the moment any of those stops being true.
 *
 * Per-frame state lives in typed arrays that are allocated once, and every helper it
 * calls returns a scalar. `navigator.getGamepads()` allocates its own array on every
 * call and there is nothing to be done about that — but nothing on this side adds to
 * it.
 *
 * Coming back from a hidden tab re-reads the pads without emitting anything. Skipping
 * that, a button pressed while the tab was in the background surfaces as a phantom
 * activation the instant the user returns.
 */

import { addDomEvent } from "../dom/event";
import type { InputPlugin, InputPluginContext } from "../input-system";
import { createIntentEvent, type IntentHandler } from "../intent-bus";
import type { InputModality, IntentSource, NavigationIntent } from "../types";
import {
  applyDeadZone,
  type DeadZoneOptions,
  resolveSector,
  type SectorOptions,
  type StickCurve,
  type StickDirection,
} from "./dead-zone";
import {
  type ButtonOverrides,
  detectPadType,
  isRepeatableIntent,
  isTriggerPressed,
  type PadType,
  resolveButtonIntent,
} from "./mapping";
import { firstRepeatAt, nextRepeatAt, type RepeatOptions } from "./repeat";

const MAX_PADS = 4;

// Every type `GamepadPluginOptions` and `GamepadPlugin` name, so a consumer of this
// entry point can declare what it passes in without reaching into a module the
// exports map does not publish.
export type {
  ButtonOverrides,
  IntentHandler,
  NavigationIntent,
  PadType,
  RepeatOptions,
  SectorOptions,
  StickCurve,
};

const MAX_BUTTONS = 20;
/** The two analogue shoulders, which need a threshold pair rather than `pressed`. */
const LEFT_TRIGGER = 6;
const RIGHT_TRIGGER = 7;

const SOURCE: IntentSource = "gamepad";
const GAMEPAD_MODALITY: InputModality = "gamepad";

const MOVE_INTENTS: Readonly<Record<StickDirection, NavigationIntent>> = {
  up: "moveUp",
  down: "moveDown",
  left: "moveLeft",
  right: "moveRight",
};

export interface GamepadRuntime {
  getGamepads(): readonly (Gamepad | null)[];
  requestFrame(callback: (now: number) => void): number;
  cancelFrame(handle: number): void;
}

export interface GamepadInfo {
  readonly index: number;
  readonly id: string;
  readonly padType: PadType;
  /** `"standard"`, or empty when the browser could not normalise the layout. */
  readonly mapping: string;
}

export interface RumbleOptions {
  readonly duration?: number | undefined;
  readonly weak?: number | undefined;
  readonly strong?: number | undefined;
  /** Defaults to the pad that moved last. */
  readonly padIndex?: number | undefined;
}

export interface GamepadPluginOptions {
  /** Radial cut for the analogue readings — the right stick's scroll. */
  readonly deadZone?: number | undefined;
  readonly curve?: StickCurve | undefined;
  /** Thresholds and stickiness of the left stick's four navigation sectors. */
  readonly sector?: SectorOptions | undefined;
  readonly repeat?: RepeatOptions | undefined;
  /** Puts confirm on the glyph rather than the position. Off by default. */
  readonly swapNintendoConfirm?: boolean | undefined;
  /** Right stick to `scrollX`/`scrollY`. On by default. */
  readonly scroll?: boolean | undefined;
  /** Where pads and frames come from — a seam for tests and for TV shims. */
  readonly runtime?: GamepadRuntime | undefined;
}

export interface GamepadPlugin extends InputPlugin {
  /**
   * For a pad the browser reported with no standard mapping. The library applies;
   * the application persists — a core with zero dependencies does no I/O.
   */
  setMapping(gamepadId: string, overrides: ButtonOverrides): void;
  /**
   * Routes one pad's intents to a handler of its own instead of the shared stack —
   * two players, two zones. The bus has no named scopes, so the route is the handler
   * itself, which needs no registry and is strictly more general than an id.
   */
  assign(padIndex: number, route: IntentHandler | null): void;
  rumble(options?: RumbleOptions | undefined): void;
  onConnected(listener: (info: GamepadInfo) => void): VoidFunction;
  onDisconnected(listener: (info: GamepadInfo) => void): VoidFunction;
  /** The pad that moved last, for drawing the right glyphs. */
  readonly activeIndex: number;
  padType(index?: number | undefined): PadType;
}

// A runtime with no Gamepad API is not a broken one — Playwright's WebKit has no
// `navigator.getGamepads`, and a television runtime that ships without it is the same
// shape. `getGamepads` is this plugin's only way in, and it is read during `setup`, so
// an unguarded call throws inside `createInputSystem` and takes down keyboard, focus
// ring and every other plugin with it: a page with no pad attached would go dark. The
// answer is the one already written for a document with no window — no runtime, and a
// plugin that registers nothing.
function defaultRuntime(win: Window | null): GamepadRuntime | null {
  if (win === null || typeof win.navigator.getGamepads !== "function") return null;
  return {
    getGamepads: (): readonly (Gamepad | null)[] => win.navigator.getGamepads(),
    requestFrame: (callback): number => win.requestAnimationFrame(callback),
    cancelFrame: (handle): void => win.cancelAnimationFrame(handle),
  };
}

export function gamepadPlugin(options: GamepadPluginOptions = {}): GamepadPlugin {
  const deadZoneOptions: DeadZoneOptions = { deadZone: options.deadZone, curve: options.curve };
  const scrollEnabled = options.scroll !== false;
  const swapConfirm = options.swapNintendoConfirm === true;

  const pressed = new Uint8Array(MAX_PADS * MAX_BUTTONS);
  const buttonDueAt = new Float64Array(MAX_PADS * MAX_BUTTONS);
  const buttonCount = new Uint16Array(MAX_PADS * MAX_BUTTONS);
  const stickDirection: (StickDirection | null)[] = new Array(MAX_PADS).fill(null);
  const stickDueAt = new Float64Array(MAX_PADS);
  const stickCount = new Uint16Array(MAX_PADS);
  const scrolling = new Uint8Array(MAX_PADS);
  const padTypes: PadType[] = new Array(MAX_PADS).fill("generic");
  const routes: (IntentHandler | null)[] = new Array(MAX_PADS).fill(null);

  const mappings = new Map<string, ButtonOverrides>();
  const connectedListeners = new Set<(info: GamepadInfo) => void>();
  const disconnectedListeners = new Set<(info: GamepadInfo) => void>();

  let context: InputPluginContext | null = null;
  let runtime: GamepadRuntime | null = null;
  let frameHandle = -1;
  let started = false;
  let paused = false;
  let resync = false;
  let activeIndex = 0;

  function emit(
    padIndex: number,
    intent: NavigationIntent,
    repeat: boolean,
    value?: number | undefined,
  ): void {
    activeIndex = padIndex;
    context?.setModality(GAMEPAD_MODALITY);

    const init = { intent, source: SOURCE, repeat, value, originalEvent: null };
    const route = routes[padIndex] ?? null;
    if (route !== null) {
      route(createIntentEvent(init));
      return;
    }
    context?.emit(init);
  }

  function forgetPad(padIndex: number): void {
    const base = padIndex * MAX_BUTTONS;
    pressed.fill(0, base, base + MAX_BUTTONS);
    buttonDueAt.fill(0, base, base + MAX_BUTTONS);
    buttonCount.fill(0, base, base + MAX_BUTTONS);
    stickDirection[padIndex] = null;
    stickDueAt[padIndex] = 0;
    stickCount[padIndex] = 0;
    scrolling[padIndex] = 0;
  }

  /** Reads a pad into the snapshot without emitting — the way back from a hidden tab. */
  function snapshot(padIndex: number, pad: Gamepad): void {
    // Also where the pad family is learnt: a page loaded with a pad already exposed
    // never sees a `gamepadconnected`, and the glyphs still have to be right.
    padTypes[padIndex] = detectPadType(pad.id);
    const base = padIndex * MAX_BUTTONS;
    for (let index = 0; index < MAX_BUTTONS; index++) {
      const button = pad.buttons[index];
      pressed[base + index] = button?.pressed ? 1 : 0;
      buttonDueAt[base + index] = 0;
      buttonCount[base + index] = 0;
    }
    stickDirection[padIndex] = resolveSector(
      null,
      pad.axes[0] ?? 0,
      pad.axes[1] ?? 0,
      options.sector,
    );
    scrolling[padIndex] = 0;
  }

  function pollButtons(padIndex: number, pad: Gamepad, now: number): void {
    const overrides = mappings.get(pad.id);
    const base = padIndex * MAX_BUTTONS;

    for (let index = 0; index < MAX_BUTTONS; index++) {
      const button = pad.buttons[index];
      if (button === undefined) continue;

      const slot = base + index;
      const was = pressed[slot] === 1;
      const isDown =
        index === LEFT_TRIGGER || index === RIGHT_TRIGGER
          ? isTriggerPressed(button.value, was)
          : button.pressed;

      if (!isDown) {
        pressed[slot] = 0;
        buttonDueAt[slot] = 0;
        continue;
      }

      const intent = resolveButtonIntent(index, overrides, swapConfirm);
      pressed[slot] = 1;
      if (intent === null) continue;

      if (!was) {
        emit(padIndex, intent, false);
        if (isRepeatableIntent(intent)) {
          buttonDueAt[slot] = firstRepeatAt(now, options.repeat);
          buttonCount[slot] = 0;
        }
        continue;
      }

      const due = buttonDueAt[slot] ?? 0;
      if (due === 0) continue;
      const next = nextRepeatAt(due, buttonCount[slot] ?? 0, now, null, options.repeat);
      if (next < 0) continue;
      buttonDueAt[slot] = next;
      buttonCount[slot] = (buttonCount[slot] ?? 0) + 1;
      emit(padIndex, intent, true);
    }
  }

  function pollNavigationStick(padIndex: number, pad: Gamepad, now: number): void {
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    const previous = stickDirection[padIndex] ?? null;
    const direction = resolveSector(previous, x, y, options.sector);

    if (direction !== previous) {
      stickDirection[padIndex] = direction;
      if (direction === null) return;
      emit(padIndex, MOVE_INTENTS[direction], false);
      stickDueAt[padIndex] = firstRepeatAt(now, options.repeat);
      stickCount[padIndex] = 0;
      return;
    }
    if (direction === null) return;

    const magnitude = Math.min(1, Math.hypot(x, y));
    const next = nextRepeatAt(
      stickDueAt[padIndex] ?? 0,
      stickCount[padIndex] ?? 0,
      now,
      magnitude,
      options.repeat,
    );
    if (next < 0) return;
    stickDueAt[padIndex] = next;
    stickCount[padIndex] = (stickCount[padIndex] ?? 0) + 1;
    emit(padIndex, MOVE_INTENTS[direction], true);
  }

  function pollScrollStick(padIndex: number, pad: Gamepad): void {
    const x = pad.axes[2] ?? 0;
    const y = pad.axes[3] ?? 0;
    const raw = Math.hypot(x, y);
    const magnitude = applyDeadZone(x, y, deadZoneOptions);

    if (magnitude > 0 && raw > 0) {
      scrolling[padIndex] = 1;
      if (x !== 0) emit(padIndex, "scrollX", false, (x / raw) * magnitude);
      if (y !== 0) emit(padIndex, "scrollY", false, (y / raw) * magnitude);
      return;
    }
    if (scrolling[padIndex] !== 1) return;
    // One last zero so a consumer knows to stop, rather than coasting for ever.
    scrolling[padIndex] = 0;
    emit(padIndex, "scrollX", false, 0);
    emit(padIndex, "scrollY", false, 0);
  }

  function frame(now: number): void {
    frameHandle = -1;
    if (runtime === null) return;

    const pads = runtime.getGamepads();
    let connected = false;

    for (let index = 0; index < MAX_PADS; index++) {
      const pad = pads[index] ?? null;
      if (pad === null) {
        forgetPad(index);
        continue;
      }
      connected = true;
      if (resync) {
        snapshot(index, pad);
        continue;
      }
      pollButtons(index, pad, now);
      pollNavigationStick(index, pad, now);
      if (scrollEnabled) pollScrollStick(index, pad);
    }

    resync = false;
    if (connected) schedule();
    else started = false;
  }

  function schedule(): void {
    if (runtime === null || frameHandle !== -1) return;
    frameHandle = runtime.requestFrame(frame);
  }

  function stop(): void {
    if (runtime !== null && frameHandle !== -1) runtime.cancelFrame(frameHandle);
    frameHandle = -1;
    started = false;
  }

  function start(): void {
    if (context === null || paused || started) return;
    if (context.doc.visibilityState === "hidden") return;
    started = true;
    schedule();
  }

  function infoFor(pad: Gamepad): GamepadInfo {
    const type = detectPadType(pad.id);
    if (pad.index >= 0 && pad.index < MAX_PADS) padTypes[pad.index] = type;
    return { index: pad.index, id: pad.id, padType: type, mapping: pad.mapping };
  }

  return {
    name: "gamepad",

    setup(pluginContext): VoidFunction {
      context = pluginContext;
      const win = pluginContext.doc.defaultView;
      runtime = options.runtime ?? defaultRuntime(win);
      if (runtime === null) return () => {};

      const teardowns = [
        addDomEvent(win, "gamepadconnected", (event: GamepadEvent) => {
          const info = infoFor(event.gamepad);
          for (const listener of [...connectedListeners]) listener(info);
          // Chrome only reveals a pad after the user presses something on it, so
          // this is where an app finds out it has one at all.
          resync = true;
          start();
        }),
        addDomEvent(win, "gamepaddisconnected", (event: GamepadEvent) => {
          const info = infoFor(event.gamepad);
          if (info.index >= 0 && info.index < MAX_PADS) forgetPad(info.index);
          for (const listener of [...disconnectedListeners]) listener(info);
        }),
        addDomEvent(pluginContext.doc, "visibilitychange", () => {
          if (pluginContext.doc.visibilityState === "hidden") {
            // Explicit, rather than trusting a hidden tab's rAF to be throttled to
            // nothing: "slower" is not "stopped", and this is a battery promise.
            stop();
            return;
          }
          resync = true;
          start();
        }),
      ];

      if (runtime.getGamepads().some((pad) => pad !== null)) {
        // Whatever a pad is already holding at startup belongs to before we existed.
        resync = true;
        start();
      }

      return () => {
        stop();
        for (const teardown of teardowns.reverse()) teardown();
        connectedListeners.clear();
        disconnectedListeners.clear();
        context = null;
        runtime = null;
      };
    },

    pause(): void {
      paused = true;
      stop();
    },

    resume(): void {
      paused = false;
      resync = true;
      start();
    },

    setMapping(gamepadId, overrides): void {
      mappings.set(gamepadId, overrides);
    },

    assign(padIndex, route): void {
      if (padIndex >= 0 && padIndex < MAX_PADS) routes[padIndex] = route;
    },

    rumble(rumbleOptions): void {
      const index = rumbleOptions?.padIndex ?? activeIndex;
      const pad = runtime?.getGamepads()[index] ?? null;
      const actuator = pad?.vibrationActuator ?? null;
      if (actuator === null) return;
      // Progressive enhancement: a pad without haptics, or a browser that refuses,
      // must never turn into a rejected promise nobody is watching.
      void actuator
        .playEffect("dual-rumble", {
          duration: rumbleOptions?.duration ?? 120,
          weakMagnitude: rumbleOptions?.weak ?? 0.4,
          strongMagnitude: rumbleOptions?.strong ?? 0.2,
        })
        .catch(() => undefined);
    },

    onConnected(listener): VoidFunction {
      connectedListeners.add(listener);
      return () => connectedListeners.delete(listener);
    },

    onDisconnected(listener): VoidFunction {
      disconnectedListeners.add(listener);
      return () => disconnectedListeners.delete(listener);
    },

    get activeIndex(): number {
      return activeIndex;
    },

    padType(index): PadType {
      return padTypes[index ?? activeIndex] ?? "generic";
    },
  };
}
