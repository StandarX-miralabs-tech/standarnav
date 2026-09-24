<script>
import { provideNav, provideNavDocument } from "../svelte";
import Tree from "./Tree.svelte";

/**
 * The provider wrapper of docs/en/svelte.md, with a tree under it.
 * @type {{
 *   options?: import("../svelte").MaybeGetter<import("../svelte").NavOptions | undefined>,
 *   doc?: import("../svelte").DocumentSource,
 *   nodes?: () => readonly import("../svelte-harness").TreeNode[],
 * }}
 */
const props = $props();

function init() {
  if (props.doc !== undefined) provideNavDocument(props.doc);
  provideNav(props.options);
}

init();
</script>

{#if props.nodes}
  <Tree nodes={props.nodes} />
{/if}
