<script>
import { provideNav } from "../svelte";
import ParityNamed from "./ParityNamed.svelte";
import Probe from "./Probe.svelte";

/**
 * @type {{
 *   shape: () => import("../../adapter-parity").ParityTree,
 *   plugins: readonly import("../svelte").InputPlugin[],
 *   intents: string[],
 *   released: string[],
 *   onSystem: (system: import("../svelte").InputSystem | null) => void,
 *   onModality: (read: () => import("../svelte").InputModality) => void,
 * }}
 */
const props = $props();

provideNav(() => ({ plugins: props.plugins, keymap: props.shape().keymap }));

// The elements belong to the tree rather than to the scope components, so they stay nested
// when the components are siblings.
/** @type {HTMLElement | null} */
let outerElement = $state(null);
/** @type {HTMLElement | null} */
let innerElement = $state(null);
const outerWithin = () => (props.shape().within ? outerElement : undefined);
const innerWithin = () => (props.shape().within ? innerElement : undefined);
</script>

{#snippet inner()}
  {#if props.shape().inner ?? true}
    <ParityNamed
      name="inner"
      trapped={props.shape().trapped ?? false}
      within={innerWithin}
      intents={props.intents}
      released={props.released}
    />
  {/if}
{/snippet}

<Probe onSystem={props.onSystem} onModality={props.onModality} />
<div data-parity="outer" bind:this={outerElement}>
  <div data-parity="inner" bind:this={innerElement}></div>
</div>
{#if props.shape().outer ?? true}
  <ParityNamed
    name="outer"
    base={props.shape().base ?? false}
    trapped={props.shape().outerTrapped ?? false}
    within={outerWithin}
    intents={props.intents}
    released={props.released}
  >
    {#if props.shape().nested}
      {@render inner()}
    {/if}
  </ParityNamed>
{/if}
{#if !props.shape().nested}
  {@render inner()}
{/if}
