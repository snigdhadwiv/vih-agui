#!/usr/bin/env node
// Runs automatically on `npm install agentic-ui`. Best-effort: never fails
// the parent install (wrapped in try/catch) and skips entirely in CI.
const { scan } = require("../src/scanner");
const { injectWidgetTag } = require("./inject-widget");

if (process.env.CI || process.env.AGENTIC_UI_SKIP_POSTINSTALL) process.exit(0);

// The package usually installs from inside <host>/node_modules/agentic-ui,
// so the host project root is two levels up.
const path = require("path");
const hostRoot = process.cwd().includes(path.join("node_modules", "agentic-ui"))
  ? path.resolve(process.cwd(), "../../")
  : process.cwd();

(async () => {
  try {
    const manifest = await scan(hostRoot);
    injectWidgetTag(hostRoot);
    console.log(`\n[agentic-ui] Scanned ${manifest.componentCount} components (${manifest.framework}).`);
    console.log("[agentic-ui] Run `npx agentic-ui init` to finish setup (env key + widget check).\n");
  } catch (e) {
    console.log("[agentic-ui] Skipped auto-scan (run `npx agentic-ui init` manually):", e.message);
  }
})();
