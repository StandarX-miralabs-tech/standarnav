/**
 * The dispatch core: the input system, the scope stack, the keymap, engage mode, the
 * modality tracker and the focusability primitives everything else is built on.
 *
 * The three engines are **not** re-exported here. Node's ESM runtime does no
 * tree-shaking, so a root re-export would make every consumer of `createInputSystem`
 * fetch, parse and execute the gamepad, spatial and focus-ring graphs, and
 * `sideEffects: false` cannot save a bundler-free runtime from that. They are their
 * own subpaths — `@standarx/nav/gamepad`, `/spatial`, `/focus-ring` — and `/debug`
 * with them.
 */

export type { EngageIntent, EngageOptions } from "./engage";
export { pushEngageScope } from "./engage";
export type {
  InputPlugin,
  InputPluginContext,
  InputSystem,
  InputSystemOptions,
} from "./input-system";
export { createInputSystem } from "./input-system";
export type {
  IntentBus,
  IntentDispatch,
  IntentHandler,
  IntentInit,
  IntentScopeHost,
  IntentScopeOptions,
} from "./intent-bus";
export { createIntentBus, createIntentEvent } from "./intent-bus";
export type { KeyDescriptor, KeymapOverrides, ResolvedKey } from "./keymap";
export { isIntentAllowedInTextEntry, isTextEntryTarget, resolveKeyIntent } from "./keymap";
export {
  getInputModality,
  isFocusVisible,
  isFocusVisibleModality,
  MODALITY_ATTRIBUTE,
  setInputModality,
  trackInputModality,
} from "./modality";
export type { FocusOptions } from "./tabbable";
export {
  FOCUSABLE_SELECTOR,
  focusElement,
  getFocusables,
  isFocusable,
  isTabbable,
} from "./tabbable";
export type { InputModality, IntentEvent, IntentSource, NavigationIntent, Rect } from "./types";
