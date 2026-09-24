<script>
import { useIntentScopeHost } from "../svelte";

/** @type {{ hosts: (import("../svelte").IntentScopeHost | null)[] }} */
const props = $props();

const host = useIntentScopeHost();

function init() {
  props.hosts.push(host);
}

init();
</script>
