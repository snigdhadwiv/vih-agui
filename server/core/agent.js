/**
 * Agentic UI Backend — Core Pipeline
 * 
 * Manages the Text-to-SQL + Viz-Spec generation pipeline.
 * Designed to be easily packaged and integrated into any host app.
 */

class AgenticUIBackend {
  /**
   * @param {Object} config
   * @param {Object} config.llmAdapter - e.g. openai-compatible or anthropic adapter
   * @param {Object} [config.db] - Optional Text-to-SQL integration
   * @param {string} [config.db.schema] - DDL schema to provide to the LLM
   * @param {Function} [config.db.executeQuery] - Async function(sql, authContext) returning rows
   */
  constructor({ llmAdapter, db = null }) {
    this.adapter = llmAdapter;
    this.db = db;
  }

  /**
   * Process a chat request
   * @param {string} prompt - The user's question
   * @param {Array} history - Previous messages
   * @param {Object} appContext - The live frontend context (KPIs, tables, etc.)
   * @param {Object} authContext - Context for RLS (e.g., userId, token)
   * @returns {Object} { summary, visualizations }
   */
  async processChat(prompt, history, appContext, authContext) {
    if (!this.adapter) {
      throw new Error("No LLM adapter configured.");
    }

    let sqlData = null;
    let sqlQuery = null;

    // STAGE 1: If database integration is enabled, attempt to generate and run SQL
    if (this.db && typeof this.db.executeQuery === "function") {
      try {
        console.log(`[AgenticUI] Analyzing prompt for SQL generation...`);
        // Dynamically fetch schema if a function is provided, else fallback to static string
        const schema = typeof this.db.getSchema === "function" ? await this.db.getSchema() : this.db.schema;
        
        if (schema) {
          const result = await this.adapter.generateSql(prompt, schema, history);
        
        if (result && result.sql) {
          sqlQuery = result.sql;
          console.log(`[AgenticUI] Generated SQL: ${sqlQuery}`);
          
          // Execute SQL using the host application's callback (which should enforce RLS)
          sqlData = await this.db.executeQuery(sqlQuery, authContext);
          console.log(`[AgenticUI] SQL execution returned ${sqlData ? sqlData.length : 0} rows.`);
        } else {
          console.log(`[AgenticUI] No SQL generated (LLM decided frontend context is sufficient or question is general).`);
        }
      } catch (err) {
        console.error("[AgenticUI] SQL Generation or Execution failed:", err.message);
        // We log the error but proceed to Stage 2 anyway, falling back to frontend context
      }
    }

    // STAGE 2: Generate the final summary and visualization spec
    console.log(`[AgenticUI] Generating visualizations...`);
    const finalResponse = await this.adapter.chat("", history, {
      userPrompt: prompt,
      appContext: appContext,
      sqlData: sqlData ? { query: sqlQuery, rows: sqlData } : null
    });

    return {
      summary: finalResponse.summary,
      visualizations: finalResponse.visualizations
    };
  }
}

module.exports = { AgenticUIBackend };
