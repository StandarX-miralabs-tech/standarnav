/**
 * `useLayoutEffect` in the browser, `useEffect` on the server.
 *
 * These effects install listeners, move focus and read geometry; running them
 * after paint would show a frame of the unmanaged state. React warns about
 * `useLayoutEffect` during SSR, hence the swap — the `typeof` guard tests for a
 * global, it never reads the DOM, so the "no document outside effects" rule is
 * intact.
 */

import { useEffect, useLayoutEffect } from "react";

export const useSafeLayoutEffect: typeof useEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;
