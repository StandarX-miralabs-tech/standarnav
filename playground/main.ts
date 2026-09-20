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

import { explainMove } from "../src/debug";
import { focusRingPlugin } from "../src/focus-ring/focus-ring";
import { type GamepadPlugin, gamepadPlugin } from "../src/gamepad/gamepad";
import { createInputSystem, type InputSystem } from "../src/index";
import { type MoveDirection, type SpatialPlugin, spatialPlugin } from "../src/spatial/spatial";

// `app` rather than the `composite` default: this page is a television surface, and
// in `composite` the arrow keys stay inside a composite and only a gamepad crosses
// the page — which on a laptop with no pad looks like nothing happening at all.
const spatial: SpatialPlugin = spatialPlugin({ mode: "app" });
const gamepad: GamepadPlugin = gamepadPlugin();

const input: InputSystem = createInputSystem({
  plugins: [gamepad, spatial, focusRingPlugin()],
});

const status = document.getElementById("status");
const readout = document.getElementById("readout");

function describe(): string {
  const active = document.activeElement;
  const id = active instanceof HTMLElement ? (active.textContent ?? "").trim() : "nothing";
  return `${input.modality} · focus: ${id || "nothing"}`;
}

function refresh(): void {
  if (status !== null) status.textContent = describe();
}

document.addEventListener("focusin", refresh);
input.onModalityChange(refresh);
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

spatial.focusFirst();

declare global {
  interface Window {
    /** The console is the diagnostic surface in v0; this is what it reaches for. */
    snav: { input: typeof input; spatial: typeof spatial; explainMove: typeof explainMove };
  }
}

window.snav = { input, spatial, explainMove };
