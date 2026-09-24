<script>
import { useInputSystem, useIntent } from "../svelte";

/** @type {{ onIntent: (intent: string) => void }} */
const props = $props();

const system = useInputSystem();
useIntent((event) => {
  props.onIntent(event.intent);
  return true;
});
</script>

<span data-testid="ready">{system.current === null ? "no" : "yes"}</span>
