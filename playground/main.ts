/**
 * The playground is served by `bun run dev` (Vite) and renders the fixture markup in
 * index.html in a real browser — the one place the engine drives a screen rather
 * than a test fixture.
 *
 * It imports from `../src` rather than from the built package on purpose: Vite
 * compiles the TypeScript, so a change to the engine is on screen on the next
 * reload with no build step between.
 *
 * `@standarx/nav/debug` is wired to the console rather than to an overlay. There is
 * no overlay in v0 — ADR-0010 keeps items 1, 2, 3 and 5 for v1 — and `explainMove`
 * is the one diagnostic that ships.
 *
 * Everything below is built inside `mount()` and taken down by the disposer it
 * returns, because the device panel changes options that are read once when a plugin
 * is constructed. Only `setMapping` and `assign` on the gamepad handle are live; every
 * other option in the package is construction-time, so switching one means building a
 * new system rather than setting a field on the old one.
 */

import { explainMove, scanNativeSelects } from "../src/debug";
import { focusRingPlugin } from "../src/focus-ring/focus-ring";
import { type GamepadPlugin, gamepadPlugin } from "../src/gamepad/gamepad";
import { createInputSystem, type InputSystem } from "../src/index";
import { keyboardPlugin } from "../src/keyboard/keyboard";
import { alphabetic } from "../src/keyboard/layouts/alphabetic";
import type { KeymapOverrides } from "../src/keymap";
import { type MoveDirection, type SpatialPlugin, spatialPlugin } from "../src/spatial/spatial";
import { attachPadCursor } from "./cursor";
import {
  attachListbox,
  attachNativeSelect,
  attachSlider,
  attachSplitter,
  attachStepper,
  attachWheelPicker,
  ENGAGED_ATTRIBUTE,
} from "./widgets";

interface PlaygroundOptions {
  mode: "app" | "composite";
  keyboard: boolean;
  gamepad: boolean;
  padCursor: boolean;
  virtualKeyboard: boolean;
  focusRing: boolean;
  verticalInText: boolean;
}

const DEFAULTS: PlaygroundOptions = {
  // `app` rather than the `composite` default: this page is a television surface, and
  // in `composite` the arrow keys stay inside a composite and only a gamepad crosses
  // the page — which on a laptop with no pad looks like nothing happening at all.
  mode: "app",
  keyboard: true,
  gamepad: true,
  padCursor: false,
  virtualKeyboard: true,
  focusRing: true,
  // Vertical moves leave the text field. Without this the page is a dead end: the arrows
  // belong to text entry (R11), left and right stay with the caret whatever happens, so a
  // remote that reaches the field has no key left that navigates anywhere.
  verticalInText: true,
};

interface Toggle {
  readonly key: keyof PlaygroundOptions;
  readonly label: string;
  readonly hint: string;
}

const TOGGLES: readonly Toggle[] = [
  { key: "keyboard", label: "Keyboard", hint: "arrows, Enter and Escape produce intents" },
  { key: "gamepad", label: "Gamepad", hint: "the polling engine; nothing is polled when off" },
  {
    key: "padCursor",
    label: "Pad drives a cursor",
    hint: "console style: the stick pushes a pointer and the focus follows it",
  },
  {
    key: "virtualKeyboard",
    label: "Virtual keyboard",
    hint: "turn it off where a real keyboard is already to hand",
  },
  { key: "focusRing", label: "Focus ring", hint: "the painted overlay, not the focus itself" },
  { key: "mode", label: "app mode", hint: "off is composite: arrows stay inside a composite" },
  {
    key: "verticalInText",
    label: "Vertical leaves a field",
    hint: "off makes the text field a dead end, which is the default everywhere else",
  },
];

/**
 * Every key the built-in table names. `null` disables a row (`src/keymap.ts:40-45`),
 * so silencing the lot is how a page says "this device is not driving me" — there is
 * no per-source switch on the system itself, the keyboard being wired into
 * `createInputSystem` rather than being a plugin that can be left out.
 */
const KEYBOARD_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  " ",
  "Spacebar",
  "Escape",
  "Esc",
  "Tab",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ContextMenu",
] as const;

const SILENCED: KeymapOverrides = {
  keys: Object.fromEntries(KEYBOARD_KEYS.map((key) => [key, null])),
};

let options: PlaygroundOptions = { ...DEFAULTS };
let teardown: VoidFunction = () => {};

function mount(): void {
  const disposers: VoidFunction[] = [];

  const spatial: SpatialPlugin = spatialPlugin({ mode: options.mode });
  const gamepad: GamepadPlugin | null = options.gamepad ? gamepadPlugin() : null;

  const plugins = [
    ...(gamepad === null ? [] : [gamepad]),
    spatial,
    ...(options.focusRing ? [focusRingPlugin()] : []),
    // The keyboard takes the `activate` default: a click on the field, or A on it from a
    // pad. This page used to pass `openOn: "focus"` so a laptop with no pad could reach
    // it, and that was the bug — `mode: "app"` turns on `pointerFollowsFocus`, so the
    // pointer focuses whatever it crosses, and a keyboard on focus is a keyboard on hover.
    ...(options.virtualKeyboard ? [keyboardPlugin({ layout: alphabetic })] : []),
  ];

  const input: InputSystem = createInputSystem({
    plugins,
    allowVerticalInText: options.verticalInText,
    ...(options.keyboard ? {} : { keymap: SILENCED }),
  });
  disposers.push(() => input.destroy());

  if (gamepad !== null && options.padCursor) {
    const cursor = attachPadCursor(gamepad, input);
    disposers.push(() => cursor.dispose());
  }

  const status = document.getElementById("status");
  const readout = document.getElementById("readout");

  function describe(): string {
    const active = document.activeElement;
    const id = active instanceof HTMLElement ? (active.textContent ?? "").trim() : "nothing";
    const held = document.querySelector(`[${ENGAGED_ATTRIBUTE}]`) !== null;
    return `${input.modality} · focus: ${id || "nothing"}${held ? " · held: arrows adjust" : ""}`;
  }

  function refresh(): void {
    if (status !== null) status.textContent = describe();
  }

  document.addEventListener("focusin", refresh);
  disposers.push(() => document.removeEventListener("focusin", refresh));
  // Taking hold and letting go are intents, not focus changes: without this the status
  // line would keep claiming the arrows navigate while a control is holding them.
  disposers.push(input.onModalityChange(refresh));
  disposers.push(input.onIntent(refresh));
  refresh();

  // Nowhere left to go. On a television this is where a bump animation or a rumble
  // goes; here it is the cheapest possible proof the edge was reached deliberately.
  disposers.push(
    spatial.onBoundsHit((direction) => {
      if (readout !== null) readout.textContent = `bounds hit: ${direction}`;
    }),
  );

  // Why the focus went there, for whoever has the console open. The explanation is
  // asked of the engine's own scoring function, so it cannot disagree with the move
  // that is about to happen.
  disposers.push(
    spatial.onWillMove((event) => {
      const from = event.from;
      if (from === null) return;
      const explanation = explainMove(from, event.direction);
      console.groupCollapsed(`${event.direction} → ${(event.to.textContent ?? "").trim()}`);
      console.table(
        explanation.candidates.map((scored) => ({
          element: (scored.candidate.element.textContent ?? "").trim(),
          container: scored.candidate.isContainer,
          aligned: scored.aligned,
          eligible: scored.eligible,
          score: Number(scored.score.toFixed(2)),
        })),
      );
      // What this container's scoring alone chooses, which is not always where the
      // focus lands: the engine answers a redirection attribute first, walks out to a
      // parent, wraps, and scrolls and rescans a frame later.
      console.log("container winner:", explanation.winner?.element ?? null);
      console.groupEnd();
    }),
  );

  // Buttons for the moves, so the page is drivable with a mouse alone when neither a
  // pad nor a keyboard is to hand.
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-move]")) {
    const onClick = (): void => {
      spatial.move(button.dataset.move as MoveDirection);
    };
    button.addEventListener("click", onClick);
    disposers.push(() => button.removeEventListener("click", onClick));
  }

  // The controls that hold a value. `pushEngageScope` is public and tested, and until
  // this page nothing used it — the gap was the recipe, not the engine. These are that
  // recipe, and `src/engage.browser.test.ts` drives this very code with real keys.
  const volume = document.getElementById("volume");
  if (volume instanceof HTMLInputElement) {
    const slider = attachSlider(input, volume);
    disposers.push(() => slider.dispose());
  }

  const quantityHost = document.getElementById("quantity-host");
  const quantity = document.getElementById("quantity");
  if (quantityHost instanceof HTMLButtonElement && quantity !== null) {
    const stepper = attachStepper(input, quantityHost, quantity, { min: 0, max: 20, step: 1 });
    disposers.push(() => stepper.dispose());
  }

  const monthHost = document.getElementById("month-host");
  const month = document.getElementById("month");
  if (monthHost !== null && month !== null) {
    const picker = attachWheelPicker(
      input,
      monthHost,
      ["January", "February", "March", "April", "May", "June"],
      month,
    );
    disposers.push(() => picker.dispose());
  }

  const grip = document.getElementById("grip");
  const pane = document.getElementById("pane");
  if (grip !== null && pane !== null) {
    const splitter = attachSplitter(input, grip, pane);
    disposers.push(() => splitter.dispose());
  }

  const regionTrigger = document.getElementById("region-trigger");
  const regionList = document.getElementById("region-list");
  const region = document.getElementById("region");
  if (regionTrigger instanceof HTMLButtonElement && regionList !== null && region !== null) {
    const listbox = attachListbox(input, regionTrigger, regionList, region);
    disposers.push(() => listbox.dispose());
  }

  const native = document.getElementById("native");
  const engagedSelects = new Set<HTMLSelectElement>();
  if (native instanceof HTMLSelectElement) {
    const select = attachNativeSelect(input, native);
    disposers.push(() => select.dispose());
    engagedSelects.add(native);
  }

  // `scanNativeSelects` reports every focusable `<select>` that would open a platform
  // popup, and it cannot tell that a recipe has taken one over: what it asks is
  // `isFocusable` plus `multiple`/`size`, none of which a recipe changes. The page
  // therefore filters the one it handled itself rather than letting the diagnostic report
  // a control that works. `attachNativeSelect` does leave `aria-expanded` behind, which a
  // future version of the scan could read as the convention this needs — that is a public
  // surface decision and bytes in a subpath measured at 0.49 kB against a 0.50 cap, so it
  // is named in ADR-0021 and not taken here.
  const unnavigable = scanNativeSelects(document.body).filter((it) => !engagedSelects.has(it));
  if (unnavigable.length > 0) {
    console.warn(
      `${unnavigable.length} native <select> the engine will focus and cannot follow into:`,
      unnavigable,
    );
  }

  window.snav = { input, spatial, explainMove };

  spatial.focusFirst();

  teardown = (): void => {
    // Reverse order: a disposer written later may hold something an earlier one owns,
    // which is the same reason `createInputSystem` tears its plugins down backwards.
    for (const dispose of disposers.reverse()) dispose();
  };
}

/**
 * Rebuilding moves the focus, because the new system focuses first from scratch. The
 * control that was just toggled is given it back — on a pad that is the difference
 * between changing one option and hunting for the panel again after every change.
 */
function remount(focusId: string | null): void {
  teardown();
  mount();
  const again = focusId === null ? null : document.getElementById(focusId);
  if (again instanceof HTMLElement) again.focus();
}

function buildPanel(): void {
  const panel = document.getElementById("device-options");
  if (panel === null) return;

  for (const toggle of TOGGLES) {
    const id = `opt-${toggle.key}`;
    const label = document.createElement("label");
    label.className = "device-option";
    label.htmlFor = id;
    label.title = toggle.hint;

    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = id;
    box.checked = toggle.key === "mode" ? options.mode === "app" : options[toggle.key] === true;
    box.addEventListener("change", () => {
      options =
        toggle.key === "mode"
          ? { ...options, mode: box.checked ? "app" : "composite" }
          : { ...options, [toggle.key]: box.checked };
      remount(id);
    });

    const text = document.createElement("span");
    text.textContent = toggle.label;

    label.append(box, text);
    panel.append(label);
  }
}

declare global {
  interface Window {
    /** The console is the diagnostic surface in v0; this is what it reaches for. */
    snav: { input: InputSystem; spatial: SpatialPlugin; explainMove: typeof explainMove };
  }
}

buildPanel();
mount();
