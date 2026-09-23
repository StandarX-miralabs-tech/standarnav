/**
 * The scope order every adapter keeps across a rebuilt system, written once. React was
 * first to need it (issue #13) and Vue opens its scopes in the same child-first order, so
 * a second copy would be a second place for the same ordering bug to come back.
 */

import type { InputSystem } from "../input-system";
import type { IntentHandler, IntentScopeOptions } from "../intent-bus";

/**
 * One scope opened through the adapter. `dispose` belongs to whichever system the
 * scope currently sits on, and is `null` while there is none.
 */
export interface Registration {
  readonly handler: IntentHandler;
  options: IntentScopeOptions | undefined;
  dispose: VoidFunction | null;
}

/**
 * Every scope opened through one provider, in the order it was opened, and the system
 * they currently sit on. A rebuilt system gets them from here, oldest first, rather
 * than from each component re-pushing on its own: components re-run in tree order,
 * children before parents, so the stack would come back in the order the scopes are
 * *declared*, and a trap opened last could land beneath what it covers.
 *
 * Owned by the provider instance, never by the module — two providers on one page keep
 * two orders.
 */
export interface ScopeRegistry {
  system: InputSystem | null;
  readonly entries: Registration[];
}

export function openOn(registry: ScopeRegistry, entry: Registration): void {
  entry.dispose = registry.system?.pushScope(entry.handler, entry.options) ?? null;
}

export function register(
  registry: ScopeRegistry,
  handler: IntentHandler,
  options: IntentScopeOptions | undefined,
): Registration {
  const entry: Registration = { handler, options, dispose: null };
  registry.entries.push(entry);
  openOn(registry, entry);
  return entry;
}

export function release(registry: ScopeRegistry, entry: Registration): void {
  const index = registry.entries.indexOf(entry);
  if (index === -1) return;
  registry.entries.splice(index, 1);
  entry.dispose?.();
  entry.dispose = null;
}

/**
 * New options for a scope that stays where it was opened. The bus only pushes on top,
 * so the scope and everything opened after it are re-pushed, in order: re-pushing the
 * one scope alone would lift it over every scope opened since it, and a page scope
 * that turns `base` would climb over the dialog trap it exists to sit under.
 */
export function reopen(
  registry: ScopeRegistry,
  entry: Registration,
  options: IntentScopeOptions,
): void {
  const index = registry.entries.indexOf(entry);
  if (index === -1) return;
  const moved = registry.entries.slice(index);
  for (const each of moved) each.dispose?.();
  entry.options = options;
  for (const each of moved) openOn(registry, each);
}
