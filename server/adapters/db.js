const knex = require('knex');

class DatabaseAdapter {
  constructor(config) {
    this.client = config.client || 'sqlite3';
    this.connection = config.connection || { filename: ':memory:' };
    
    this.db = knex({
      client: this.client,
      connection: this.connection,
      useNullAsDefault: this.client === 'sqlite3'
    });
  }

  // Military-grade guard rail against destructive operations
  validateSql(sql) {
    const normalized = sql.toLowerCase().trim();
    // Must start with SELECT
    if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
      throw new Error("SECURITY_ERROR: Only SELECT or WITH (CTEs) queries are permitted.");
    }

    // Regex blocklist for dangerous keywords
    const dangerousKeywords = [
      '\\bdrop\\b', '\\bdelete\\b', '\\bupdate\\b', '\\binsert\\b', '\\balter\\b',
      '\\btruncate\\b', '\\bgrant\\b', '\\brevoke\\b', '\\bexec\\b', '\\bcall\\b'
    ];
    
    for (const kw of dangerousKeywords) {
      if (new RegExp(kw, 'i').test(normalized)) {
        throw new Error(`SECURITY_ERROR: Destructive keyword detected. Query blocked.`);
      }
    }
  }

  async executeQuery(sql, authContext) {
    this.validateSql(sql);
    
    console.log(`[DatabaseAdapter] Executing safe SQL: ${sql}`);
    
    // Timeout enforcement (5 seconds)
    const timeoutMs = 5000;
    const queryPromise = this.db.raw(sql);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("QUERY_TIMEOUT: Execution took too long.")), timeoutMs)
    );
    
    const result = await Promise.race([queryPromise, timeoutPromise]);
    
    // Standardize result sets across dialects
    if (this.client === 'sqlite3') {
      return result;
    } else {
      return result.rows || result[0] || result;
    }
  }

  // Introspect schema to generate DDL string for the LLM
  async getSchemaDDL() {
    let tables = [];
    let ddlString = "";

    try {
      if (this.client === 'sqlite3') {
        const result = await this.db.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
        tables = result.map(r => r.name);
        
        for (const table of tables) {
          const columns = await this.db.raw(`PRAGMA table_info("${table}")`);
          ddlString += `CREATE TABLE ${table} (\n`;
          const cols = columns.map(c => `  ${c.name} ${c.type}`).join(',\n');
          ddlString += cols + `\n);\n\n`;
        }
      } else {
        ddlString = "/* Connect a specific database dialect to see introspection */";
      }
    } catch (err) {
      console.warn("[DatabaseAdapter] Schema Introspection failed:", err.message);
      ddlString = "/* Schema introspection failed */";
    }

    return ddlString.trim();
  }
}

module.exports = { DatabaseAdapter };
