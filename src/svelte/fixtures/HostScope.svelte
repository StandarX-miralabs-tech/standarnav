<script>
import { useIntentScopeHost } from "../svelte";

/**
 * Opens a scope through the host whenever `open` turns true, the way a machine does.
 * @type {{
 *   name: string,
 *   open: boolean,
 *   trapped?: boolean,
 *   onIntent: (name: string) => import("../svelte").IntentHandler,
 * }}
 */
const props = $props();

// One derived per prop, so that a parent handing down an equal value re-opens nothing.
const name = $derived(props.name);
const open = $derived(props.open);
const trapped = $derived(props.trapped);
const onIntent = $derived(props.onIntent);

const host = useIntentScopeHost();
$effect(() => {
  if (!open || host === null) return;
  return host.pushScope(onIntent(name), { trapped });
});
</script>
