<script>
import { useIntent } from "../svelte";

/**
 * The recipe of docs/en/svelte.md: the dialog traps and names its surface.
 * @type {{ onClose: () => void, surface?: Element, children?: import("svelte").Snippet }}
 */
const props = $props();

/** @type {HTMLElement | null} */
let element = $state(null);

// An element given from outside is passed as a value, read once; the bound one as a getter.
function within() {
  return props.surface ?? (() => element);
}

useIntent(
  (event) => {
    if (event.intent !== "back") return false;
    props.onClose();
    return true;
  },
  { trapped: true, within: within() },
);
</script>

<div bind:this={element} data-snav="container" data-snav-trap>
  {@render props.children?.()}
</div>
