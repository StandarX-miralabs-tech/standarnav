<script>
/** @type {{ type: "text" | "email", onModel: (value: string) => void }} */
const props = $props();

let value = $state("");
$effect(() => {
  props.onModel(value);
});
</script>

{#if props.type === "email"}
  <input type="email" bind:value />
{:else}
  <input type="text" bind:value />
{/if}
