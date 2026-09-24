<script>
import { useIntent } from "../svelte";

/**
 * @type {{
 *   name: string,
 *   onIntent: (name: string) => import("../svelte").IntentHandler,
 *   children?: import("svelte").Snippet,
 * }}
 */
const props = $props();

useIntent((event) => props.onIntent(props.name)(event));
</script>

{@render props.children?.()}
