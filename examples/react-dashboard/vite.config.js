import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Suppress "Unknown custom element" warning for <agentic-ui-agent>
  // which is a valid Web Component registered at runtime.
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "UNKNOWN_ELEMENT") return;
        warn(warning);
      },
    },
  },
});
