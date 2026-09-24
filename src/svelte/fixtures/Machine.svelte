<script>
import { useInputSystem, useIntentScopeHost } from "../svelte";

/**
 * Pushes a scope while the component initialises, before any system exists.
 * @type {{ handler: import("../svelte").IntentHandler, atInit: unknown[] }}
 */
const props = $props();

const host = useIntentScopeHost();
const system = useInputSystem();

function init() {
  props.atInit.push(host, system.current);
  host?.pushScope(props.handler);
}

init();
</script>
