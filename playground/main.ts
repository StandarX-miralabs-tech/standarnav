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
 */

import { explainMove, scanNativeSelects } from "../src/debug";
import { focusRingPlugin } from "../src/focus-ring/focus-ring";
import { type GamepadPlugin, gamepadPlugin } from "../src/gamepad/gamepad";
import { createInputSystem, type InputSystem } from "../src/index";
import { keyboardPlugin } from "../src/keyboard/keyboard";
import { alphabetic } from "../src/keyboard/layouts/alphabetic";
import { type MoveDirection, type SpatialPlugin, spatialPlugin } from "../src/spatial/spatial";
import {
  attachListbox,
  attachSlider,
  attachSplitter,
  attachStepper,
  attachWheelPicker,
  ENGAGED_ATTRIBUTE,
} from "./widgets";

// `app` rather than the `composite` default: this page is a television surface, and
// in `composite` the arrow keys stay inside a composite and only a gamepad crosses
// the page — which on a laptop with no pad looks like nothing happening at all.
const spatial: SpatialPlugin = spatialPlugin({ mode: "app" });
const gamepad: GamepadPlugin = gamepadPlugin();

// `openOn: "focus"` rather than the `gamepad` default, so the keyboard is reachable from
// a laptop with no pad — which is the only way most of this page gets driven. A real
// television application wants the default.
const input: InputSystem = createInputSystem({
  plugins: [
    gamepad,
    spatial,
    focusRingPlugin(),
    keyboardPlugin({ layout: alphabetic, openOn: "focus" }),
  ],
});

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
input.onModalityChange(refresh);
// Taking hold and letting go are intents, not focus changes: without this the status
// line would keep claiming the arrows navigate while a control is holding them.
input.onIntent(refresh);
refresh();

// Nowhere left to go. On a television this is where a bump animation or a rumble
// goes; here it is the cheapest possible proof the edge was reached deliberately.
spatial.onBoundsHit((direction) => {
  if (readout !== null) readout.textContent = `bounds hit: ${direction}`;
});

// Why the focus went there, for whoever has the console open. The explanation is
// asked of the engine's own scoring function, so it cannot disagree with the move
// that is about to happen.
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
});

// Buttons for the moves, so the page is drivable with a mouse alone when neither a
// pad nor a keyboard is to hand.
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-move]")) {
  button.addEventListener("click", () => {
    spatial.move(button.dataset.move as MoveDirection);
  });
}

// The four controls that hold a value. `pushEngageScope` is public and tested, and
// until now nothing used it — the gap was the recipe, not the engine. These are that
// recipe, and `src/engage.browser.test.ts` drives this very code with real keys.
const volume = document.getElementById("volume");
if (volume instanceof HTMLInputElement) attachSlider(input, volume);

const quantityHost = document.getElementById("quantity-host");
const quantity = document.getElementById("quantity");
if (quantityHost instanceof HTMLButtonElement && quantity !== null) {
  attachStepper(input, quantityHost, quantity, { min: 0, max: 20, step: 1 });
}

const monthHost = document.getElementById("month-host");
const month = document.getElementById("month");
if (monthHost !== null && month !== null) {
  attachWheelPicker(
    input,
    monthHost,
    ["January", "February", "March", "April", "May", "June"],
    month,
  );
}

const grip = document.getElementById("grip");
const pane = document.getElementById("pane");
if (grip !== null && pane !== null) attachSplitter(input, grip, pane);

const regionTrigger = document.getElementById("region-trigger");
const regionList = document.getElementById("region-list");
const region = document.getElementById("region");
if (regionTrigger instanceof HTMLButtonElement && regionList !== null && region !== null) {
  attachListbox(input, regionTrigger, regionList, region);
}

// The diagnostic for the one control the engine cannot rescue. A closed `<select>`
// opens a platform popup outside the document, and on a desktop the browser navigates
// that popup itself — so the trap is invisible exactly where the code is written. The
// page keeps one on purpose, so this prints something.
const unnavigable = scanNativeSelects(document.body);
if (unnavigable.length > 0) {
  console.warn(
    `${unnavigable.length} native <select> the engine will focus and cannot follow into:`,
    unnavigable,
  );
}

spatial.focusFirst();

declare global {
  interface Window {
    /** The console is the diagnostic surface in v0; this is what it reaches for. */
    snav: { input: typeof input; spatial: typeof spatial; explainMove: typeof explainMove };
  }
}

window.snav = { input, spatial, explainMove };
