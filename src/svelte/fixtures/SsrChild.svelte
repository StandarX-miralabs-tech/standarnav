<script>
import { useInputModality, useInputSystem, useIntent, useIntentScopeHost } from "../svelte";

const system = useInputSystem();
const modality = useInputModality();
useIntent(() => true, { trapped: true, within: () => null });
const host = useIntentScopeHost();
host?.pushScope(() => true);
</script>

<span>{system.current === null ? "none" : "built"}:{modality.current}:{host !== null}</span>
