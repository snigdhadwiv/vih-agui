/**
 * Agentic UI Backend — Core Pipeline
 *
 * Manages the Text-to-SQL + Viz-Spec generation pipeline.
 * 
 * Upgrades in this version:
 *   - Self-Healing SQL Loop: If generated SQL fails, the error is fed back
 *     to the LLM silently to auto-correct. Retries up to MAX_SQL_RETRIES times.
 *   - The user never sees a SQL error — only the final successful result.
 */

const MAX_SQL_RETRIES = 3;

class AgenticUIBackend {
  /**
   * @param {Object} config
   * @param {Object} config.llmAdapter - e.g. openai-compatible or anthropic adapter
   * @param {Object} [config.db] - Optional Text-to-SQL integration
   * @param {Function} [config.db.getSchema] - Async function returning DDL string
   * @param {Function} [config.db.executeQuery] - Async function(sql, authContext) returning rows
   */
  constructor({ llmAdapter, db = null }) {
    this.adapter = llmAdapter;
    this.db = db;
  }

  /**
   * Self-Healing SQL Execution Loop
   * Attempts to generate and execute SQL, retrying on failure.
   * On each retry, feeds the specific error back to the LLM so it can self-correct.
   *
   * @param {string} prompt - Original user prompt
   * @param {string} schema - Database DDL schema
   * @param {Array} history - Conversation history
   * @param {Object} authContext - RLS auth context
   * @returns {{ sql: string, rows: Array } | null}
   */
  async _executeWithSelfHealing(prompt, schema, history, authContext) {
    let lastError = null;
    let correctionHint = null;

    for (let attempt = 1; attempt <= MAX_SQL_RETRIES; attempt++) {
      try {
        console.log(`[AgenticUI] SQL Attempt ${attempt}/${MAX_SQL_RETRIES}...`);

        // On retry, include the previous error in the generation prompt
        // so the LLM can understand what went wrong and self-correct
        const result = await this.adapter.generateSql(
          prompt,
          schema,
          history,
          correctionHint  // null on first attempt, error message on retries
        );

        if (!result || !result.sql) {
          console.log(`[AgenticUI] LLM decided no SQL is needed. Using frontend context only.`);
          return null;
        }

        const sql = result.sql;
        console.log(`[AgenticUI] Generated SQL: ${sql}`);

        // Attempt execution — throws if security validation or DB fails
        const rows = await this.db.executeQuery(sql, authContext);
        console.log(`[AgenticUI] ✅ SQL executed successfully. Returned ${rows.length} rows.`);

        return { sql, rows };

      } catch (err) {
        lastError = err;
        correctionHint = `Your previous SQL query failed with this error: "${err.message}". Please analyze the schema again carefully and generate a corrected SELECT query that avoids this issue.`;
        console.warn(`[AgenticUI] ⚠️ SQL Attempt ${attempt} failed: ${err.message}. ${attempt < MAX_SQL_RETRIES ? 'Retrying...' : 'All retries exhausted.'}`);
      }
    }

    // All retries exhausted — log and gracefully fall back to frontend context
    console.error(`[AgenticUI] ❌ Self-healing loop failed after ${MAX_SQL_RETRIES} attempts. Last error: ${lastError.message}`);
    return null;
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

    // STAGE 1: Attempt database query with Self-Healing Loop
    if (this.db && typeof this.db.executeQuery === "function") {
      const schema = typeof this.db.getSchema === "function"
        ? await this.db.getSchema()
        : this.db.schema;

      if (schema) {
        // This loop will silently retry and self-correct on failure
        sqlData = await this._executeWithSelfHealing(prompt, schema, history, authContext);
      }
    }

    // STAGE 2: Generate final summary and visualization spec
    // Whether sqlData is populated or null, the LLM generates the best response it can
    console.log(`[AgenticUI] Generating visualizations from ${sqlData ? `${sqlData.rows.length} DB rows` : 'frontend context'}...`);

    const finalResponse = await this.adapter.chat("", history, {
      userPrompt: prompt,
      appContext: appContext,
      sqlData: sqlData ? { query: sqlData.sql, rows: sqlData.rows } : null
    });

    return {
      summary: finalResponse.summary,
      visualizations: finalResponse.visualizations
    };
  }
}

module.exports = { AgenticUIBackend };
