// The playground is served by `bun run dev` (Vite) and renders the fixture markup in
// index.html in a real browser. The engine is wired here once `src/` exists (ROADMAP v0):
//
//   import { createInputSystem } from "../src/index";
//   import { gamepadPlugin } from "../src/gamepad/gamepad";
//   import { spatialPlugin } from "../src/spatial/spatial";
//   createInputSystem({ plugins: [gamepadPlugin(), spatialPlugin({ mode: "app" })] });

const status = document.getElementById("status");
if (status !== null) {
  status.textContent = "engine not wired yet: see ROADMAP.md, v0";
}
