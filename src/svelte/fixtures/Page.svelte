<script>
import { useIntent } from "../svelte";

/** @type {{ handler: import("../svelte").IntentHandler, trapped: boolean }} */
const props = $props();

useIntent((event) => props.handler(event), { trapped: () => props.trapped });
</script>
