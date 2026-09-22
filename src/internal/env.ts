// `process` is declared locally rather than pulled from @types/node: the package has
// `types: []` and must stay usable in a browser with no bundler, where the global
// does not exist. Bundlers that define NODE_ENV still fold the comparison away.
// Dot access, not a computed key: that is the exact form bundlers substitute.
declare const process: { env?: { NODE_ENV?: string } } | undefined;

export function isDev(): boolean {
  return typeof process === "undefined" || process?.env?.NODE_ENV !== "production";
}
