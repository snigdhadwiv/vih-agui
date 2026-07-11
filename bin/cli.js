#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const { scan } = require("../src/scanner");
const { injectWidgetTag } = require("./inject-widget");
const { findLatestBackup } = require("../server/backup");

const cmd = process.argv[2] || "help";
const root = process.cwd();

async function main() {
  switch (cmd) {
    case "init": {
      console.log("→ Scanning project…");
      const manifest = await scan(root);
      console.log(`  Framework detected: ${manifest.framework}`);
      console.log(`  Components indexed: ${manifest.componentCount}`);
      console.log(`  Chart libraries:    ${manifest.chartLibraries.join(", ") || "none found"}`);
      console.log(`  Table libraries:    ${manifest.tableLibraries.join(", ") || "none found"}`);

      const injected = injectWidgetTag(root, manifest.framework);
      console.log(injected
        ? `→ Widget script injected into ${injected}`
        : "→ Could not auto-inject. Add the snippet from README.md manually (2 lines).");

      const envPath = path.join(root, ".env.agentic-ui.example");
      fs.writeFileSync(envPath,
`# --- Pick ONE backend ---

# Option A: Anthropic (tool-calling, reads files itself)
# AGENTIC_UI_ANTHROPIC_API_KEY=sk-ant-...

# Option B: any OpenAI-compatible /v1/chat/completions server
# (GLM, vLLM, Ollama, LM Studio, a self-hosted endpoint, etc.)
# AGENTIC_UI_LLM_PROVIDER=openai_compatible
# AGENTIC_UI_LLM_BASE_URL=http://45.194.90.209:8000/v1
# AGENTIC_UI_LLM_MODEL=zai-org/GLM-4.7-Flash
# AGENTIC_UI_LLM_API_KEY=

# Neither set = MOCK mode (canned replies, good for testing the widget/apply flow)

AGENTIC_UI_PORT=4411
AGENTIC_UI_HOST=127.0.0.1

# --- Production hardening (set these for anything beyond solo local testing) ---
# AGENTIC_UI_TOKEN=change-me-to-something-long-and-random
# AGENTIC_UI_ALLOWED_ORIGINS=https://staging.yourapp.com
# AGENTIC_UI_RATE_LIMIT=60
`);
      console.log(`→ Wrote ${path.relative(root, envPath)} — copy to .env and add your key`);
      console.log("\n✔ Done. Run `npx agentic-ui server` in one terminal and your dev server in");
      console.log("  another. The agent bubble will appear bottom-right. Total setup: ~5 min,");
      console.log("  first real generated component within the hour.");
      break;
    }
    case "scan": {
      const manifest = await scan(root);
      console.log(`Manifest written to .agentic-ui/manifest.json (${manifest.componentCount} components).`);
      break;
    }
    case "undo": {
      const target = process.argv[3];
      if (!target) {
        console.log("Usage: npx agentic-ui undo <relative/path/to/file>");
        break;
      }
      const backup = findLatestBackup(root, target);
      if (!backup) {
        console.log(`No backup found for ${target} in .agentic-ui/backups/.`);
        break;
      }
      fs.copyFileSync(backup, path.join(root, target));
      console.log(`Restored ${target} from ${path.relative(root, backup)}`);
      break;
    }
    case "server": {
      require("../server/index.js");
      break;
    }
    default:
      console.log(`agentic-ui <command>

Commands:
  init             Scan project, inject the floating widget, scaffold .env
  scan             Re-scan the project and refresh .agentic-ui/manifest.json
  server           Start the local agent server (proxies to your configured LLM)
  undo <path>      Restore a file from its most recent pre-apply backup
`);
  }
}

main().catch((err) => {
  console.error("agentic-ui error:", err.message);
  process.exit(1);
});
