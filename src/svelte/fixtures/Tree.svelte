<script>
import Tree from "./Tree.svelte";

/** @type {{ nodes: () => readonly import("../svelte-harness").TreeNode[] }} */
const props = $props();
</script>

{#each props.nodes() as node (node.key)}
  {@const Component = node.component}
  {#if node.children}
    <Component {...node.props}><Tree nodes={node.children} /></Component>
  {:else}
    <Component {...node.props} />
  {/if}
{/each}
