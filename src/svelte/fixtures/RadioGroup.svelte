<script>
import { useIntent } from "../svelte";

const CHOICES = ["low", "medium", "high"];

/** @type {{ within: "getter" | "none" }} */
const props = $props();

/** @type {HTMLElement | null} */
let group = $state(null);
let at = $state(0);

function within() {
  return props.within === "getter" ? () => group : undefined;
}

useIntent(
  (event) => {
    if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
    const step = event.intent === "moveDown" ? 1 : -1;
    at = Math.max(0, Math.min(CHOICES.length - 1, at + step));
    return true;
  },
  { within: within() },
);
</script>

<div role="radiogroup" bind:this={group}>
  {#each CHOICES as choice, index (choice)}
    <label><input type="radio" name="level" value={choice} checked={index === at} />{choice}</label>
  {/each}
</div>
