export function arrayEquals(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/**
 * One level deep, by own enumerable key. `object` rather than a `Record` so a
 * `Record<number, T>` — a keymap's `keyCodes` — is accepted without a cast at the
 * call site.
 */
export function recordEquals(a: object | undefined, b: object | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const entries = Object.entries(a);
  if (entries.length !== Object.keys(b).length) return false;
  const other = b as Record<string, unknown>;
  for (const [key, value] of entries) {
    if (!Object.is(value, other[key])) return false;
  }
  return true;
}
