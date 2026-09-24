<script>
import { provideNavDocument } from "../svelte";
import App from "./App.svelte";
import HookScope from "./HookScope.svelte";
import SsrChild from "./SsrChild.svelte";

/** @type {{ doc: () => Document }} */
const props = $props();

provideNavDocument(() => props.doc());
</script>

<App nodes={() => [{ key: "child", component: SsrChild }]} />
<HookScope name="orphan" onIntent={() => () => true} />
