/**
 * Agentic UI — Project Scanner
 * -----------------------------
 * Walks the host project, figures out what framework/styling system it uses,
 * indexes existing components (especially cards, tables, charts, filters),
 * and writes a single manifest.json that the agent uses as "ground truth"
 * context on every request. Re-run any time with `npx agentic-ui scan`.
 */
const fs = require("fs");
const path = require("path");
const fg = require("fast-glob");

const CHART_LIBS = ["recharts", "chart.js", "react-chartjs-2", "d3", "victory",
  "@nivo/core", "echarts", "echarts-for-react", "apexcharts", "react-apexcharts", "plotly.js"];
const TABLE_LIBS = ["ag-grid-community", "ag-grid-react", "react-table", "@tanstack/react-table",
  "material-react-table", "primereact", "@mui/x-data-grid"];
const UI_KITS = ["@mui/material", "antd", "@chakra-ui/react", "@radix-ui/react-dialog",
  "shadcn-ui", "bootstrap", "react-bootstrap", "vuetify", "primevue", "@angular/material"];

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function detectFramework(pkg) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  if (deps.next) return "next";
  if (deps.nuxt || deps.nuxt3) return "nuxt";
  if (deps["@angular/core"]) return "angular";
  if (deps.svelte || deps["@sveltejs/kit"]) return "svelte";
  if (deps.vue) return "vue";
  if (deps.react) return "react";
  return "vanilla";
}

function detectLibs(pkg, list) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  return list.filter((lib) => deps[lib]);
}

// Very lightweight heuristics — no AST parsing, just filename + text signals.
// This keeps the scanner dependency-free and fast (<1s on most repos) while
// still being accurate enough to route the agent to the right files.
function classifyComponent(filePath, source) {
  const name = path.basename(filePath).toLowerCase();
  const s = source.toLowerCase();
  const tags = [];
  if (/card/.test(name) || /kpi/.test(name)) tags.push("card");
  if (/table|grid/.test(name) || /<table/.test(s)) tags.push("table");
  if (/chart|graph/.test(name) || CHART_LIBS.some((l) => s.includes(l.split("/").pop()))) tags.push("chart");
  if (/filter|search|toolbar/.test(name)) tags.push("filter");
  if (/modal|dialog/.test(name)) tags.push("modal");
  if (/layout|shell|dashboard/.test(name)) tags.push("layout");
  if (/button/.test(name)) tags.push("button");
  return tags;
}

function extractExports(source) {
  const names = new Set();
  const patterns = [
    /export\s+default\s+function\s+([A-Za-z0-9_]+)/g,
    /export\s+function\s+([A-Za-z0-9_]+)/g,
    /export\s+const\s+([A-Za-z0-9_]+)\s*=/g,
    /export\s+class\s+([A-Za-z0-9_]+)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source))) names.add(m[1]);
  }
  return [...names];
}

function extractApiEndpoints(source) {
  const endpoints = new Set();
  const patterns = [
    /fetch\(\s*[`'"]([^`'"]+)[`'"]/g,
    /axios\.\w+\(\s*[`'"]([^`'"]+)[`'"]/g,
    /(?:baseURL|API_BASE|API_URL)\s*[:=]\s*[`'"]([^`'"]+)[`'"]/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source))) endpoints.add(m[1]);
  }
  return [...endpoints];
}

function extractColorTokens(rootDir) {
  const tokens = {};
  // Tailwind config
  for (const cfg of ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.cjs"]) {
    const p = path.join(rootDir, cfg);
    if (fs.existsSync(p)) tokens.tailwindConfigPath = cfg;
  }
  // CSS custom properties in global stylesheets
  const cssFiles = fg.sync(["**/*.css", "**/*.scss"], {
    cwd: rootDir, ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"], absolute: true,
  }).slice(0, 40);
  const varRe = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  for (const file of cssFiles) {
    const text = fs.readFileSync(file, "utf8");
    let m;
    while ((m = varRe.exec(text))) {
      if (!tokens[m[1]]) tokens[m[1]] = m[2].trim();
    }
  }
  return tokens;
}

async function scan(rootDir = process.cwd()) {
  const pkg = readJSON(path.join(rootDir, "package.json"));
  const framework = detectFramework(pkg);

  const srcGlobs = ["src/**/*.{js,jsx,ts,tsx,vue,svelte}", "app/**/*.{js,jsx,ts,tsx,vue,svelte}",
    "components/**/*.{js,jsx,ts,tsx,vue,svelte}", "pages/**/*.{js,jsx,ts,tsx,vue,svelte}"];
  const files = fg.sync(srcGlobs, {
    cwd: rootDir, ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**"],
    absolute: true,
  });

  const components = [];
  const apiEndpoints = new Set();

  for (const file of files) {
    let source;
    try { source = fs.readFileSync(file, "utf8"); } catch { continue; }
    const tags = classifyComponent(file, source);
    const exportsFound = extractExports(source);
    extractApiEndpoints(source).forEach((e) => apiEndpoints.add(e));
    if (tags.length || exportsFound.length) {
      components.push({
        path: path.relative(rootDir, file),
        exports: exportsFound,
        tags,
        sizeBytes: source.length,
      });
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    framework,
    packageManager: fs.existsSync(path.join(rootDir, "pnpm-lock.yaml")) ? "pnpm"
      : fs.existsSync(path.join(rootDir, "yarn.lock")) ? "yarn" : "npm",
    chartLibraries: detectLibs(pkg, CHART_LIBS),
    tableLibraries: detectLibs(pkg, TABLE_LIBS),
    uiKits: detectLibs(pkg, UI_KITS),
    styling: extractColorTokens(rootDir),
    apiEndpoints: [...apiEndpoints].slice(0, 100),
    components: components
      .sort((a, b) => (b.tags.length - a.tags.length))
      .slice(0, 400), // cap for token budget; agent can re-scan a subfolder on demand
    componentCount: components.length,
  };

  const outDir = path.join(rootDir, ".agentic-ui");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

module.exports = { scan };
