<script>
import { onMount } from "svelte";
import { useIntentScopeHost } from "../svelte";

/**
 * Keeps a disposer past its own unmount.
 * @type {{
 *   handler: import("../svelte").IntentHandler,
 *   keep: (dispose: (() => void) | undefined) => void,
 * }}
 */
const props = $props();

const host = useIntentScopeHost();
onMount(() => {
  props.keep(host?.pushScope(props.handler));
});
</script>
