/**
 * Agentic UI — local agent server
 * --------------------------------
 * Runs alongside your dev server (default :4411).
 * Accepts POST /api/agentic-ui/chat with { prompt, history, context }
 * and returns { summary, visualizations[] } — a declarative viz-spec
 * that the client-side widget renders as live SVG charts/tables/cards.
 *
 * No files are written. The AI layer generates UI overlays in the browser.
 *
 * Backend selection (.env):
 *   AGENTIC_UI_LLM_PROVIDER = anthropic | openai_compatible  (auto-detect)
 *   anthropic:             AGENTIC_UI_ANTHROPIC_API_KEY
 *   openai_compatible:     AGENTIC_UI_LLM_BASE_URL, AGENTIC_UI_LLM_MODEL, AGENTIC_UI_LLM_API_KEY
 *
 * Neither set = MOCK mode (canned viz-spec for testing the widget without API cost).
 */
require("dotenv").config({ path: ".env" });
const express = require("express");

const { createAnthropicAdapter } = require("./adapters/anthropic");
const { createOpenAICompatibleAdapter } = require("./adapters/openai-compatible");
const { corsMiddleware, authMiddleware, rateLimitMiddleware } = require("./security");
const { AgenticUIBackend } = require("./core/agent");
const { DatabaseAdapter } = require("./adapters/db");

const ROOT = process.cwd();
const PORT = process.env.AGENTIC_UI_PORT || 4411;
const BIND_HOST = process.env.AGENTIC_UI_HOST || "127.0.0.1";

// ---- Pick a backend --------------------------------------------------
const PROVIDER = process.env.AGENTIC_UI_LLM_PROVIDER
  || (process.env.AGENTIC_UI_ANTHROPIC_API_KEY ? "anthropic"
    : process.env.AGENTIC_UI_LLM_BASE_URL ? "openai_compatible" : null);

let adapter = null;
if (PROVIDER === "anthropic") {
  adapter = createAnthropicAdapter({ apiKey: process.env.AGENTIC_UI_ANTHROPIC_API_KEY });
} else if (PROVIDER === "openai_compatible") {
  adapter = createOpenAICompatibleAdapter({
    baseUrl: process.env.AGENTIC_UI_LLM_BASE_URL,
    apiKey: process.env.AGENTIC_UI_LLM_API_KEY || "",
    model: process.env.AGENTIC_UI_LLM_MODEL,
    rootDir: ROOT,
  });
}
const MOCK = !adapter;

// ---- Configure Database Engine ---------------------------------------
// The plugin is completely database-agnostic. By changing 'client', you can 
// connect to PostgreSQL ('pg'), MySQL ('mysql'), or SQLite ('sqlite3').
const DB_CLIENT = process.env.AGENTIC_UI_DB_CLIENT || "sqlite3";
const DB_CONNECTION = process.env.AGENTIC_UI_DB_CONNECTION || { filename: ":memory:" };

let dbAdapter = null;
if (process.env.AGENTIC_UI_ENABLE_DB !== "false") {
  dbAdapter = new DatabaseAdapter({
    client: DB_CLIENT,
    connection: DB_CONNECTION
  });
  console.log(`[Server] Database Adapter initialized for ${DB_CLIENT}`);
}

const realDbConfig = dbAdapter ? {
  getSchema: () => dbAdapter.getSchemaDDL(),
  executeQuery: (sql, authContext) => dbAdapter.executeQuery(sql, authContext)
} : null;

// Initialize Core Pipeline
let backend = null;
if (!MOCK) {
  backend = new AgenticUIBackend({
    llmAdapter: adapter,
    db: realDbConfig // Enable Real Text-to-SQL + Security Guardrails
  });
}

// ---- MOCK response (no LLM configured) ------------------------------
function mockResponse(prompt, context) {
  const kpis = context?.kpis || [];
  const tables = context?.tables || [];

  const visualizations = [];

  // Always produce a KPI cards mock if there are KPIs in context
  if (kpis.length) {
    visualizations.push({
      id: "mock_kpi",
      type: "kpi_cards",
      title: "Key Metrics",
      cards: kpis.slice(0, 4).map((k) => ({
        label: k.label,
        value: k.value,
        format: "number",
      })),
    });
  }

  // Produce a bar chart mock using table data if available
  if (tables.length && tables[0].rows?.length) {
    const tbl = tables[0];
    const data = tbl.rows.slice(0, 7).map((row) => ({
      label: String(row[0]).slice(0, 12),
      value: parseFloat(String(row[2]).replace(/[^0-9.]/g, "")) || Math.floor(Math.random() * 100 + 20),
    }));
    visualizations.push({
      id: "mock_bar",
      type: "bar_chart",
      title: `${tbl.title || "Orders"} Overview`,
      data,
      color: "#5eead4",
    });
    visualizations.push({
      id: "mock_pie",
      type: "pie_chart",
      title: "Distribution",
      data,
    });
  }

  // Default mock if nothing in context
  if (!visualizations.length) {
    visualizations.push(
      {
        id: "mock_bar",
        type: "bar_chart",
        title: "Sample Revenue by Day (MOCK)",
        data: [
          { label: "Mon", value: 58000 }, { label: "Tue", value: 61200 },
          { label: "Wed", value: 59800 }, { label: "Thu", value: 67300 },
          { label: "Fri", value: 72100 }, { label: "Sat", value: 54200 },
          { label: "Sun", value: 48900 },
        ],
        color: "#5eead4",
      },
      {
        id: "mock_kpi",
        type: "kpi_cards",
        title: "Sample KPIs (MOCK)",
        cards: [
          { label: "Revenue MTD", value: "$482,300", format: "number", delta: 0.084 },
          { label: "Orders", value: "3,204", format: "number", delta: 0.021 },
          { label: "Churn Rate", value: "2.1%", format: "number", delta: -0.004 },
        ],
      }
    );
  }

  return {
    summary: `[MOCK MODE — no LLM backend configured] Based on your prompt: "${prompt}". Configure AGENTIC_UI_ANTHROPIC_API_KEY or AGENTIC_UI_LLM_BASE_URL in .env for real AI responses.`,
    visualizations,
  };
}

// ---- Express app -----------------------------------------------------
const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(corsMiddleware());
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => console.log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`));
  next();
});
app.use(rateLimitMiddleware({ windowMs: 5 * 60 * 1000, max: Number(process.env.AGENTIC_UI_RATE_LIMIT) || 60 }));

// ---- Health check ----------------------------------------------------
app.get("/api/agentic-ui/health", (req, res) => {
  res.json({
    ok: true,
    mode: MOCK ? "mock" : PROVIDER,
    model: process.env.AGENTIC_UI_LLM_MODEL || null,
  });
});

// ---- Chat endpoint ---------------------------------------------------
// Accepts: { prompt: string, history: [{role, text}][], context: AppContext }
// Returns: { summary: string, visualizations: VizSpec[] | null }
app.post("/api/agentic-ui/chat", authMiddleware(), async (req, res) => {
  try {
    const { prompt, history = [], context } = req.body;
    if (typeof prompt !== "string" || !prompt.trim()) throw new Error("Missing prompt");

    if (MOCK) return res.json(mockResponse(prompt, context));

    const historyMessages = history.map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: h.text,
    }));

    const authContext = { token: req.headers.authorization?.replace('Bearer ', '') };

    const out = await backend.processChat(prompt, historyMessages, context || null, authContext);

    res.json({
      summary: out.summary || "Done.",
      visualizations: out.visualizations || null,
    });
  } catch (err) {
    console.error("[agentic-ui/chat error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- Legacy apply endpoint (kept for backwards compatibility) --------
// No longer the primary flow — viz-spec responses don't write to disk.
app.post("/api/agentic-ui/apply", authMiddleware(), (req, res) => {
  res.status(410).json({
    ok: false,
    error: "The /apply endpoint is no longer used. The new plugin renders visualizations live in the browser without writing files.",
  });
});

// ---- Start -----------------------------------------------------------
app.listen(PORT, BIND_HOST, () => {
  console.log(`\n🤖 Agentic UI server → http://${BIND_HOST}:${PORT}`);
  if (MOCK) {
    console.warn("⚠  MOCK mode — no LLM backend configured. Responses are canned.");
    console.warn("   Set AGENTIC_UI_ANTHROPIC_API_KEY or AGENTIC_UI_LLM_BASE_URL in .env.");
  } else {
    const detail = PROVIDER === "openai_compatible"
      ? ` (${process.env.AGENTIC_UI_LLM_MODEL} @ ${process.env.AGENTIC_UI_LLM_BASE_URL})`
      : "";
    console.log(`✓  Backend: ${PROVIDER}${detail}`);
  }
  if (!process.env.AGENTIC_UI_TOKEN) {
    console.warn("⚠  No AGENTIC_UI_TOKEN set — unauthenticated mode (fine for local dev).");
  }
  console.log("   API: POST /api/agentic-ui/chat  { prompt, history, context }");
  console.log("        GET  /api/agentic-ui/health\n");
});
