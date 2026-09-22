/**
 * `@standarx/nav/keyboard/alphabetic` — data, and nothing else.
 *
 * A to Z in reading order, which is the layout a television usually wants: a remote user
 * hunting for one letter scans an alphabet faster than a QWERTY grid, where the position
 * of a letter is only knowable by having typed on one.
 */

import type { KeyboardLayout } from "../keyboard";

export const alphabetic: KeyboardLayout = {
  id: "alphabetic",
  languages: ["en", "fr", "de", "es", "it", "pt", "nl"],
  initialLayer: "letters",
  layers: {
    letters: [
      "abcdefg",
      "hijklmn",
      "opqrstu",
      "vwxyz",
      "1234567890",
      [
        { label: "⇧", action: "shift" },
        { label: "space", action: "space", span: 3 },
        { label: "⌫", action: "backspace" },
        { label: "done", action: "close", span: 2 },
      ],
    ],
  },
};
