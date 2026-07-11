const Anthropic = require("@anthropic-ai/sdk");

/**
 * Anthropic adapter — viz-spec mode.
 * Uses tool-calling to let the model query context data, then responds
 * with a structured visualization spec (not file diffs).
 */
function createAnthropicAdapter({ apiKey }) {
  const anthropic = new Anthropic({ apiKey });

  const VIZ_INSTRUCTION = `
You are Agentic UI, an AI analytics layer for any web application.
Given the user's request and the current app context (KPIs, table data, etc.),
respond with a JSON visualization spec (no markdown fences):

{"summary":"one sentence","visualizations":[
  {"id":"v1","type":"CHART_TYPE","title":"...","data":[{"label":"...","value":NUMBER}],"color":"#hex"}
]}

CHART_TYPE options: bar_chart, line_chart, pie_chart, donut_chart, area_chart, kpi_cards, data_table, scatter_plot, comparison, text_insight, gauge, horizontal_bar_chart, stacked_bar_chart, grouped_bar_chart, 100_percent_stacked_bar, spline_chart, step_line_chart, multi_axis_line_chart, stacked_area_chart, streamgraph, range_area_chart, half_donut_chart, polar_area_chart, radial_bar_chart, tree_map, funnel_chart, pyramid_chart, waterfall_chart, bubble_chart, stat_with_sparkline, stat_with_sparkbar, progress_bar, progress_ring, linear_gauge, bullet_chart, status_indicator, matrix_table, heatmap, calendar_heatmap, comparison_board, word_cloud, candlestick_chart, box_plot, range_bar_chart, timeline_events, radar_chart, pictograph, dot_plot, dumbbell_plot, parallel_coordinates, network_graph

For kpi_cards: "cards":[{"label":"...","value":"...","format":"currency|number|percent","delta":NUMBER}]
For data_table: "columns":["..."],"rows":[[...]]
For comparison: "periods":[{"label":"...","metrics":[{"name":"...","value":NUMBER}]}]
For text_insight: "content":"...","bullets":["..."]
For gauge: "value":NUMBER,"max":NUMBER,"label":"..."

For univariate/distribution data, always generate 2-3 different chart types (pie + donut + bar).
Always generate at least 2 visualizations when there is enough data.

IMPORTANT: If the user's prompt is a simple greeting (e.g. 'hi', 'hello'), a conversational question, OR a general query that does not require visual charts (e.g. 'what is this page about?', 'explain this data'), provide a smart text response in the summary and set visualizations to null. DO NOT force or generate unnecessary charts unless the request benefits from data visualization.

IMPORTANT: Provide highly intelligent and concise answers. DO NOT use generic introductory text like 'Here are the visualizations' or 'Based on your data'. Provide direct analytical insights.
`.trim();

  return {
    name: "anthropic",
    async generateSql(userPrompt, schema, historyMessages = []) {
      const messages = [
        ...historyMessages,
        { role: "user", content: userPrompt }
      ];

      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 300,
        system: `You are an expert SQL generator. Given a database schema, write a valid SQL query to answer the user's question.\nReply ONLY with a JSON object:\n{"sql": "SELECT ..."}\nIf the question does not require database data, reply with {"sql": null}.\n\nSchema:\n${schema}`,
        messages,
      });

      const raw = response.content.find((b) => b.type === "text")?.text || "";
      try {
        const text = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
        return JSON.parse(text);
      } catch {
        return { sql: null };
      }
    },

    async chat(systemPromptIgnored, historyMessages, { userPrompt, appContext, sqlData }) {
      const contextText = appContext
        ? `Current app context:\n${JSON.stringify(appContext, null, 2).slice(0, 3000)}`
        : "";

      let sqlText = "";
      if (sqlData) {
        sqlText = `\nDatabase Query Executed: ${sqlData.query}\nRows Returned: ${sqlData.rows.length}\n`;
        if (sqlData.rows.length > 0) {
          sqlText += `Sample Data:\n${JSON.stringify(sqlData.rows.slice(0, 10))}\n\nDatabase SQL results are available above. Use these as your primary source of truth if they answer the user's question.`;
        }
      }

      const fullSystem = `${VIZ_INSTRUCTION}\n\n${contextText}\n${sqlText}`;

      const messages = [
        ...historyMessages,
        { role: "user", content: userPrompt },
      ];

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: fullSystem,
        messages,
      });

      const raw = response.content.find((b) => b.type === "text")?.text || "";
      try {
        const text = raw.trim()
          .replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(text);
        return {
          summary: parsed.summary || "Here are your visualizations.",
          visualizations: parsed.visualizations || null,
          actions: parsed.actions || null,
        };
      } catch {
        return {
          summary: raw || "Received an unexpected response.",
          visualizations: raw
            ? [{ id: "v1", type: "text_insight", title: "Response", content: raw }]
            : null,
        };
      }
    },
  };
}

module.exports = { createAnthropicAdapter };
