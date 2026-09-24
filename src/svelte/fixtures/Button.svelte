<script>
/** @type {{ id?: string, label: string }} */
const props = $props();
</script>

<button type="button" id={props.id}>{props.label}</button>
