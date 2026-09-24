<script>
import { useIntent } from "../svelte";

/** @type {{ tick: number }} */
const props = $props();

/** @type {HTMLElement | null} */
let element = $state(null);
useIntent(() => false, { within: () => element });
</script>

<div bind:this={element} data-tick={props.tick}></div>
