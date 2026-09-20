/**
 * `@standarx/nav/keyboard/qwerty` — data, and nothing else.
 *
 * The type import erases, so this module imports nothing at runtime: that is what makes
 * a language a file rather than a change to the engine, and what keeps a French
 * application from shipping Cyrillic (ADR-0022, decision 4).
 */

import type { KeyboardLayout } from "../keyboard";

export const qwerty: KeyboardLayout = {
  id: "qwerty",
  languages: ["en"],
  initialLayer: "letters",
  layers: {
    letters: [
      "1234567890",
      "qwertyuiop",
      "asdfghjkl",
      [
        { label: "⇧", action: "shift" },
        { label: "z", value: "z" },
        { label: "x", value: "x" },
        { label: "c", value: "c" },
        { label: "v", value: "v" },
        { label: "b", value: "b" },
        { label: "n", value: "n" },
        { label: "m", value: "m" },
        { label: "⌫", action: "backspace" },
      ],
      [
        { label: "?#=", action: "layer", layer: "symbols" },
        { label: "space", action: "space", span: 5 },
        { label: "done", action: "close", span: 2 },
      ],
    ],
    symbols: [
      "@#$%&*-+()",
      "!\"':;/?,.",
      "_=<>[]{}|~",
      [
        { label: "abc", action: "layer", layer: "letters" },
        { label: "space", action: "space", span: 5 },
        { label: "⌫", action: "backspace" },
        { label: "done", action: "close", span: 2 },
      ],
    ],
  },
};
