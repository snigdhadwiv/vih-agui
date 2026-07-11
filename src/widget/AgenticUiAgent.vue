<!--
  Optional convenience wrapper for Vue apps. Same underlying Web Component —
  purely so it can live in components/ and be used like any other SFC.
  Remember to add 'agentic-ui-agent' to compilerOptions.isCustomElement so
  Vue doesn't warn about an unknown element.
-->
<template>
  <agentic-ui-agent :endpoint="endpoint"></agentic-ui-agent>
</template>

<script setup>
import "./agentic-widget.js";
defineProps({ endpoint: { type: String, default: "http://localhost:4411" } });
</script>
