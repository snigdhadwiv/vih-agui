const fs = require("fs");
const path = require("path");

/**
 * Generic OpenAI-compatible adapter — viz-spec mode.
 * Works with any /v1/chat/completions endpoint: GLM, Qwen, Llama, Mistral,
 * Ollama, LM Studio, vLLM, etc.
 *
 * The adapter:
 *  1. Fetches the model's max_model_len from /v1/models (cached).
 *  2. Builds a compact prompt from: system context + appContext (DOM data) + userPrompt.
 *  3. Progressively trims context to fit within the budget.
 *  4. Requests a viz-spec JSON response with 2-3 chart types.
 *  5. Returns { summary, visualizations[] } — no file diffs, no source editing.
 */
function createOpenAICompatibleAdapter({ baseUrl, apiKey, model, rootDir }) {
  const BASE_URL = baseUrl.replace(/\/$/, "");
  const AUTH_HEADERS = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  // ~4 chars per token — conservative estimate for mixed code + prose
  function estimateTokens(text) {
    return Math.ceil((text || "").length / 3.5);
  }

  // Fetch max context length once, then cache
  let _contextLimit = null;
  async function getContextLimit() {
    if (_contextLimit) return _contextLimit;
    try {
      const res = await fetch(`${BASE_URL}/models`, { headers: AUTH_HEADERS });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const info = (data.data || []).find((m) => m.id === model);
      _contextLimit = info?.max_model_len || 4096;
    } catch {
      _contextLimit = 4096;
    }
    return _contextLimit;
  }

  /**
   * Summarise the appContext into a compact string the LLM can use.
   * Stays well under 500 tokens for small-context models.
   */
  function buildContextSummary(appContext) {
    if (!appContext) return "";
    const parts = [];

    if (appContext.url) parts.push(`Page: ${appContext.url}`);
    if (appContext.title) parts.push(`Title: ${appContext.title}`);

    if (appContext.kpis?.length) {
      const kpiStr = appContext.kpis
        .slice(0, 8)
        .map((k) => `${k.label}=${k.value}`)
        .join(", ");
      parts.push(`KPIs: ${kpiStr}`);
    }

    if (appContext.tables?.length) {
      appContext.tables.slice(0, 3).forEach((t) => {
        const cols = (t.columns || []).join(", ");
        const rows = (t.rows || [])
          .slice(0, 10)
          .map((r) => r.join("|"))
          .join("; ");
        parts.push(`Table "${t.title || t.id || "unnamed"}": cols=[${cols}] rows=[${rows}]`);
      });
    }

    if (appContext && appContext.data && Object.keys(appContext.data).length) {
      for (const [key, val] of Object.entries(appContext.data)) {
        const compact = JSON.stringify(val).slice(0, 300);
        parts.push(`DataProvider "${key}": ${compact}`);
      }
    }

    return parts.join("\n");
  }

  function buildSqlDataSummary(sqlData) {
    if (!sqlData) return "";
    const { rows, query } = sqlData;
    if (!rows || rows.length === 0) return `Database Query: ${query}\nRows returned: 0`;

    // Dynamic Data Pagination: Only pass METADATA to the LLM, not the full dataset.
    // The full rows are sent directly to the frontend, completely bypassing the context window.
    const columns = Object.keys(rows[0]);
    const sample  = rows.slice(0, 5); // 5 rows is enough for the LLM to understand the shape
    return [
      `Database Query Executed: ${query}`,
      `Total Rows Returned: ${rows.length} (full dataset sent directly to frontend - do NOT embed data values)`,
      `Columns: [${columns.join(", ")}]`,
      `Sample (first 5 rows): ${JSON.stringify(sample)}`,
    ].join("\n");
  }


  /**
   * Build the full messages array, dynamically trimming to fit context budget.
   * Leaves at least MIN_OUTPUT_TOKENS for the model to generate a response.
   */
  async function buildMessages(appContext, sqlData, historyMessages, userPrompt) {
    const OVERHEAD = 100;
    const contextLimit = await getContextLimit();
    const isSmallCtx = contextLimit <= 3000;
    const outputBudget = Math.min(isSmallCtx ? 700 : 2000, contextLimit - OVERHEAD - 200);
    const promptBudget = contextLimit - outputBudget - OVERHEAD;
    const hasSqlData = !!(sqlData && sqlData.rows && sqlData.rows.length > 0);
    const columns = hasSqlData ? Object.keys(sqlData.rows[0]) : [];

    const vizInstruction = hasSqlData ? `
Reply with ONLY a JSON object (no markdown fences, no prose outside).
The full dataset has already been sent to the frontend renderer — do NOT embed data values.
Instead, reference columns by key so the frontend maps them automatically.

Format for column-reference charts:
{"summary":"one sentence insight","visualizations":[{
  "id":"v1",
  "type":"CHART_TYPE",
  "title":"...",
  "xKey":"COLUMN_NAME",
  "yKey":"COLUMN_NAME",
  "color":"#hex"
}]}

Available columns from the query result: [${columns.join(", ")}]

CHART_TYPE options: bar_chart, line_chart, pie_chart, donut_chart, horizontal_bar_chart, stacked_bar_chart, grouped_bar_chart, area_chart, spline_chart, waterfall_chart, scatter_plot, funnel_chart, tree_map, kpi_cards, data_table, text_insight

For kpi_cards (aggregates): use "cards":[{"label":"...","value":"COLUMN or computed","format":"currency|number|percent"}]
For data_table: use "xKey" for label column, "yKey" for value column — frontend will map rows automatically
For text_insight: use "content":"...","bullets":["..."]

IMPORTANT: Use xKey/yKey with the EXACT column names from the available columns list above.
IMPORTANT: DO NOT include a "data" array. The renderer will map it from the raw rows.
IMPORTANT: Return 2-3 different chart types to show the data from multiple angles.
IMPORTANT: Provide direct analytical insights in summary. No generic filler text.
`.trim() : `
Reply with ONLY a JSON object (no markdown fences, no prose outside):
{"summary":"one sentence","visualizations":[{"id":"v1","type":"CHART_TYPE","title":"...","data":[{"label":"...","value":NUMBER}],"color":"#hex"}],"actions":[{"type":"navigate|scroll","url|target":"..."}]}

CHART_TYPE options: bar_chart, line_chart, pie_chart, donut_chart, area_chart, kpi_cards, data_table, scatter_plot, comparison, text_insight, gauge, horizontal_bar_chart, stacked_bar_chart, grouped_bar_chart, 100_percent_stacked_bar, spline_chart, step_line_chart, multi_axis_line_chart, stacked_area_chart, streamgraph, range_area_chart, half_donut_chart, polar_area_chart, radial_bar_chart, tree_map, funnel_chart, pyramid_chart, waterfall_chart, bubble_chart, stat_with_sparkline, stat_with_sparkbar, progress_bar, progress_ring, linear_gauge, bullet_chart, status_indicator, matrix_table, heatmap, calendar_heatmap, comparison_board, word_cloud, candlestick_chart, box_plot, range_bar_chart, timeline_events, radar_chart, pictograph, dot_plot, dumbbell_plot, parallel_coordinates, network_graph

For kpi_cards: use "cards":[{"label":"...","value":"...","format":"currency|number|percent","delta":NUMBER}]
For data_table: use "columns":["..."],"rows":[[...]]
For comparison: use "periods":[{"label":"...","metrics":[{"name":"...","value":NUMBER}]}]
For text_insight: use "content":"...","bullets":["..."]

IMPORTANT: For univariate/distribution requests, return 2-3 different chart types showing the same data.
Set visualizations:null only if the request is completely unclear or doesn't need charts.

IMPORTANT: If the user asks to navigate, go to a page, or view a section, provide the appropriate "actions" array. For navigation use type "navigate" and the "url". For scrolling use type "scroll" and the "target" selector.

IMPORTANT: If the user's prompt is a simple greeting (e.g. 'hi', 'hello'), a conversational question, OR a general query that does not require visual charts, provide a smart text response in the summary and set visualizations to null. DO NOT force charts unless necessary.

IMPORTANT: Provide highly intelligent and concise answers. DO NOT use generic introductory text like 'Here are the visualizations' or 'Based on your data'. Provide direct analytical insights.
`.trim();

    const contextSummary = buildContextSummary(appContext);
    const sqlSummary = buildSqlDataSummary(sqlData);

    let systemBase = `You are Agentic UI, an AI analytics layer for a web application. You scan the app's live data and generate multiple relevant visualizations. You always produce concrete, data-driven charts using the actual data provided.`;
    if (sqlSummary) {
      systemBase += `\n\nDatabase SQL results are available below. Use these as your primary source of truth if they answer the user's question.`;
    }

    // Strategy: try increasingly compact context
    const strategies = [
      () => `${systemBase}\n\nCurrent app data:\n${contextSummary}\n\n${sqlSummary}\n\n${vizInstruction}`,
      () => `${systemBase}\n\nApp data (summary):\n${contextSummary.slice(0, 2000)}\n\n${sqlSummary}\n\n${vizInstruction}`,
      () => `${systemBase}\n\n${sqlSummary}\n\n${vizInstruction}`,
    ];

    for (const strategy of strategies) {
      const system = strategy();
      const messages = [
        { role: "system", content: system },
        ...historyMessages,
        { role: "user", content: userPrompt },
      ];
      const totalText = messages.map((m) => m.content).join(" ");
      if (estimateTokens(totalText) <= promptBudget) {
        return { messages, maxTokens: outputBudget };
      }
    }

    // Absolute fallback
    return {
      messages: [
        { role: "system", content: `${systemBase}\n\n${vizInstruction}` },
        { role: "user", content: userPrompt },
      ],
      maxTokens: outputBudget,
    };
  }

  /**
   * Robust JSON extraction — handles markdown fences, double-wrapping,
   * truncated JSON (tries to extract the visualizations array directly).
   */
  function extractJSON(raw) {
    function tryParse(text) {
      try {
        const p = JSON.parse(text);
        // Unwrap double-wrap: model put JSON inside summary field
        if (p.summary && !p.visualizations && typeof p.summary === "string") {
          const inner = p.summary.trim()
            .replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
          if (inner.startsWith("{")) {
            try { const p2 = JSON.parse(inner); if (p2.visualizations !== undefined) return p2; } catch {}
          }
        }
        return p;
      } catch { return null; }
    }

    // Strip markdown code fences
    let text = raw.trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();

    let parsed = tryParse(text);
    if (parsed) return parsed;

    // Find the outermost { } block
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = tryParse(match[0]);
      if (parsed) return parsed;
    }

    // Try to reconstruct if JSON is truncated (model hit max_tokens mid-way)
    // Find the summary and any partial visualizations array
    const summaryMatch = raw.match(/"summary"\s*:\s*"([^"]+)"/);
    const vizMatch = raw.match(/"visualizations"\s*:\s*(\[[\s\S]*)/);
    if (summaryMatch) {
      let vizArray = null;
      if (vizMatch) {
        try { vizArray = JSON.parse(vizMatch[1]); } catch {
          // Try to find complete objects within the truncated array
          const objMatches = [...vizMatch[1].matchAll(/\{[^{}]*\}/g)];
          if (objMatches.length) {
            try { vizArray = objMatches.map(m => JSON.parse(m[0])); } catch {}
          }
        }
      }
      return { summary: summaryMatch[1], visualizations: vizArray || null };
    }

    return null;
  }

  return {
    name: "openai_compatible",

    async generateSql(userPrompt, schema, historyMessages = [], correctionHint = null) {
      // On a retry, append the correction hint so the LLM knows exactly what went wrong
      const userContent = correctionHint
        ? `${userPrompt}\n\n[SELF-HEALING RETRY]: ${correctionHint}`
        : userPrompt;

      const messages = [
        { role: "system", content: `You are an expert SQL generator. Given a database schema, write a valid, read-only SQL SELECT query to answer the user's question.\nReply ONLY with a JSON object:\n{"sql": "SELECT ..."}\nIf the question does not require database data, reply with {"sql": null}.\nNEVER generate INSERT, UPDATE, DELETE, DROP, ALTER or any other mutating statement.\n\nSchema:\n${schema}` },
        ...historyMessages,
        { role: "user", content: userContent }
      ];

      const body = {
        model,
        messages,
        max_tokens: 300,
        temperature: 0.1,
      };

      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`LLM SQL generation failed: ${res.status}`);
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "";
      
      const parsed = extractJSON(raw);
      return parsed || { sql: null };
    },

    async chat(systemPromptIgnored, historyMessages, { userPrompt, appContext, sqlData }) {
      const { messages, maxTokens } = await buildMessages(appContext, sqlData, historyMessages, userPrompt);

      const body = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
        chat_template_kwargs: { enable_thinking: false },
      };

      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`LLM endpoint responded ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "";

      const parsed = extractJSON(raw);
      if (parsed) {
        return {
          summary: parsed.summary || "Here are your visualizations.",
          visualizations: parsed.visualizations || null,
          actions: parsed.actions || null,
        };
      }

      // Unparseable — return as text insight
      return {
        summary: raw || "The model returned an unexpected response.",
        visualizations: raw
          ? [{ id: "v1", type: "text_insight", title: "Response", content: raw }]
          : null,
      };
    },
  };
}

module.exports = { createOpenAICompatibleAdapter };
