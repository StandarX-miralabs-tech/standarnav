<script>
import { provideNav, provideNavDocument } from "../svelte";

/** @type {{ order: "document first" | "provider first" | "document only" }} */
const props = $props();

function init() {
  if (props.order === "provider first") {
    provideNav();
    provideNavDocument(document);
  } else {
    provideNavDocument(document);
    if (props.order === "document first") provideNav();
  }
}

init();
</script>
