<script>
import { useIntent } from "../svelte";

/** @type {HTMLElement | null} */
let group = $state(null);

// The recipe of docs/en/svelte.md: native radios in app mode keep their own axis.
useIntent(
  (event) =>
    event.source === "keyboard" &&
    (event.intent === "moveUp" || event.intent === "moveDown") &&
    group?.contains(document.activeElement) === true
      ? "native"
      : false,
  { within: () => group },
);
</script>

<div role="radiogroup" bind:this={group}>
  {#each ["s", "m", "l"] as size (size)}
    <label style="display: block">
      <input type="radio" name="size" value={size} checked={size === "s"} />
      {size}
    </label>
  {/each}
</div>
