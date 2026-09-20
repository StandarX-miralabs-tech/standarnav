/**
 * `@standarx/nav/keyboard/azerty` — data, and nothing else.
 *
 * The accented row is the reason this is a separate module and not a flag on qwerty: a
 * layout is the alphabet a language actually needs, and an English application has no
 * business shipping é è ç à ù.
 */

import type { KeyboardLayout } from "../keyboard";

export const azerty: KeyboardLayout = {
  id: "azerty",
  languages: ["fr"],
  initialLayer: "letters",
  layers: {
    letters: [
      "1234567890",
      "azertyuiop",
      "qsdfghjklm",
      [
        { label: "⇧", action: "shift" },
        { label: "w", value: "w" },
        { label: "x", value: "x" },
        { label: "c", value: "c" },
        { label: "v", value: "v" },
        { label: "b", value: "b" },
        { label: "n", value: "n" },
        { label: "⌫", action: "backspace" },
      ],
      "éèçàù",
      [
        { label: "?#=", action: "layer", layer: "symbols" },
        { label: "espace", action: "space", span: 5 },
        { label: "ok", action: "close", span: 2 },
      ],
    ],
    symbols: [
      "@#€%&*-+()",
      "!\"':;/?,.",
      "_=<>[]{}|~",
      "âêîôûëïüœ",
      [
        { label: "abc", action: "layer", layer: "letters" },
        { label: "espace", action: "space", span: 5 },
        { label: "⌫", action: "backspace" },
        { label: "ok", action: "close", span: 2 },
      ],
    ],
  },
};
