<script>
import { useInputModality, useInputSystem, useIntentScopeHost } from "../svelte";

/**
 * @type {{
 *   onSystem?: (system: import("../svelte").InputSystem | null) => void,
 *   onHost?: (host: import("../svelte").IntentScopeHost | null) => void,
 *   onModality?: (read: () => import("../svelte").InputModality) => void,
 * }}
 */
const props = $props();

const system = useInputSystem();
const modality = useInputModality();
const host = useIntentScopeHost();

function init() {
  props.onHost?.(host);
  props.onModality?.(() => modality.current);
}

init();

/** @param {import("../svelte").InputSystem | null} seen */
function render(seen) {
  props.onSystem?.(seen);
  return seen === null ? "no" : "yes";
}
</script>

<span data-testid="ready">{render(system.current)}</span>
<span data-testid="modality">{modality.current}</span>
