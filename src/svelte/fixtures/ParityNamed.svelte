<script>
import { onDestroy } from "svelte";
import { useIntent } from "../svelte";

/**
 * Declines every intent, so both scopes are asked and the list is the order of the stack.
 * @type {{
 *   name: string,
 *   trapped?: boolean,
 *   base?: boolean,
 *   within: () => Element | null | undefined,
 *   intents: string[],
 *   released: string[],
 *   children?: import("svelte").Snippet,
 * }}
 */
const props = $props();

useIntent(
  (event) => {
    props.intents.push(`${props.name}:${event.intent}`);
    return false;
  },
  { trapped: () => props.trapped, base: () => props.base, within: () => props.within() },
);
onDestroy(() => {
  props.released.push(props.name);
});
</script>

{@render props.children?.()}
