const fs = require("fs");
const path = require("path");
const fg = require("fast-glob");

const SNIPPET = `<!-- Agentic UI: floating AI agent (auto-injected, safe to move) -->
<script type="module" src="/node_modules/agentic-ui/src/widget/agentic-widget.js"></script>
<agentic-ui-agent endpoint="http://localhost:4411"></agentic-ui-agent>
`;

/**
 * Finds the most likely HTML entry point and inserts the widget tag right
 * before </body>. Idempotent — running twice won't double-inject.
 * Returns the relative path injected into, or null if none was found
 * (e.g. Angular/Next.js server-rendered shells — README covers manual step).
 */
function injectWidgetTag(root) {
  const candidates = fg.sync(["index.html", "public/index.html", "src/index.html"], {
    cwd: root, absolute: true,
  });
  const target = candidates[0];
  if (!target) return null;

  let html = fs.readFileSync(target, "utf8");
  if (html.includes("agentic-ui-agent")) return path.relative(root, target); // already injected

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${SNIPPET}</body>`);
  } else {
    html += `\n${SNIPPET}`;
  }
  fs.writeFileSync(target, html);
  return path.relative(root, target);
}

module.exports = { injectWidgetTag, SNIPPET };
