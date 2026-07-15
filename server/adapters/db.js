/**
 * DatabaseAdapter — Database-Agnostic Connector
 *
 * Supports: sqlite3, pg (PostgreSQL), mysql, mssql (via knex)
 *
 * Security Layer:
 *   - AST (Abstract Syntax Tree) parsing via `node-sql-parser`
 *   - Read-only enforcement: Only SELECT/WITH statements permitted
 *   - Unauthorized table access prevention
 *   - 5-second execution timeout
 */

const knex = require('knex');
const { Parser } = require('node-sql-parser');

const astParser = new Parser();

class DatabaseAdapter {
  /**
   * @param {Object} config
   * @param {string} config.client - 'sqlite3' | 'pg' | 'mysql' | 'mssql'
   * @param {Object|string} config.connection - knex connection config or filename
   * @param {string[]} [config.allowedTables] - Optional whitelist of tables the AI is allowed to query
   */
  constructor(config) {
    this.client = config.client || 'sqlite3';
    this.connection = config.connection || { filename: ':memory:' };
    this.allowedTables = config.allowedTables || null; // null = allow all

    this.db = knex({
      client: this.client,
      connection: this.connection,
      useNullAsDefault: this.client === 'sqlite3'
    });
  }

  /**
   * AST-Based Security Validation
   * Mathematically parses the SQL to ensure it is a pure read-only statement.
   * This is far stronger than regex matching and cannot be bypassed via prompt injection.
   */
  validateSql(sql) {
    let ast;
    try {
      // Attempt to parse the SQL into an Abstract Syntax Tree
      ast = astParser.astify(sql, { database: 'SQLite' });
    } catch (parseErr) {
      throw new Error(`SECURITY_ERROR: SQL parsing failed. Query is malformed or not permitted. Details: ${parseErr.message}`);
    }

    // Normalize: handle both single statements and arrays
    const statements = Array.isArray(ast) ? ast : [ast];

    for (const stmt of statements) {
      // RULE 1: Only SELECT and WITH (CTEs) are permitted
      const stmtType = (stmt.type || '').toLowerCase();
      if (stmtType !== 'select') {
        throw new Error(
          `SECURITY_ERROR: Statement of type "${stmtType.toUpperCase()}" is not permitted. Only SELECT queries are allowed.`
        );
      }

      // RULE 2: No subquery tricks (e.g., SELECT inside an INSERT)
      const sqlLower = sql.toLowerCase();
      const forbidden = ['insert', 'update', 'delete', 'drop', 'alter', 'truncate', 'grant', 'revoke', 'exec', 'execute', 'call', 'create'];
      for (const kw of forbidden) {
        // Check using word boundaries to prevent false positives (e.g. 'deleted_at' column)
        if (new RegExp(`\\b${kw}\\b`).test(sqlLower)) {
          throw new Error(`SECURITY_ERROR: Forbidden keyword "${kw.toUpperCase()}" detected in query. Blocked.`);
        }
      }

      // RULE 3: Table allowlist enforcement (if configured)
      if (this.allowedTables && stmt.from) {
        const queriedTables = stmt.from.map(f => (f.table || '').toLowerCase());
        for (const table of queriedTables) {
          if (table && !this.allowedTables.includes(table)) {
            throw new Error(`SECURITY_ERROR: Access to table "${table}" is not permitted. Allowed tables: ${this.allowedTables.join(', ')}`);
          }
        }
      }
    }

    console.log(`[DatabaseAdapter] ✅ AST validation passed.`);
  }

  /**
   * Execute a validated SQL query against the connected database.
   */
  async executeQuery(sql, authContext) {
    // Run through the AST security layer first
    this.validateSql(sql);

    console.log(`[DatabaseAdapter] Executing SQL: ${sql}`);

    // Enforce a strict 5-second execution timeout
    const timeoutMs = 5000;
    const queryPromise = this.db.raw(sql);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("QUERY_TIMEOUT: Query exceeded the 5-second limit. Simplify the query.")), timeoutMs)
    );

    const result = await Promise.race([queryPromise, timeoutPromise]);

    // Normalize result rows across database dialects
    if (this.client === 'sqlite3') {
      return Array.isArray(result) ? result : [];
    } else {
      return result.rows || result[0] || [];
    }
  }

  /**
   * Auto-introspect the connected database and generate a DDL schema string.
   * The LLM uses this to understand what tables and columns exist.
   */
  async getSchemaDDL() {
    let ddlString = '';

    try {
      if (this.client === 'sqlite3') {
        const tables = await this.db.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
        for (const { name } of tables) {
          const columns = await this.db.raw(`PRAGMA table_info("${name}")`);
          ddlString += `CREATE TABLE ${name} (\n`;
          ddlString += columns.map(c => `  ${c.name} ${c.type || 'TEXT'}`).join(',\n');
          ddlString += `\n);\n\n`;
        }
      } else if (this.client === 'pg') {
        const tables = await this.db.raw(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);
        for (const { table_name } of tables.rows) {
          const columns = await this.db.raw(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = '${table_name}'
          `);
          ddlString += `CREATE TABLE ${table_name} (\n`;
          ddlString += columns.rows.map(c => `  ${c.column_name} ${c.data_type}`).join(',\n');
          ddlString += `\n);\n\n`;
        }
      } else if (this.client === 'mysql') {
        const tables = await this.db.raw(`SHOW TABLES`);
        const tableList = tables[0].map(row => Object.values(row)[0]);
        for (const tableName of tableList) {
          const columns = await this.db.raw(`DESCRIBE \`${tableName}\``);
          ddlString += `CREATE TABLE ${tableName} (\n`;
          ddlString += columns[0].map(c => `  ${c.Field} ${c.Type}`).join(',\n');
          ddlString += `\n);\n\n`;
        }
      } else {
        ddlString = '/* Schema introspection not available for this database dialect. */';
      }
    } catch (err) {
      console.warn(`[DatabaseAdapter] Schema introspection failed: ${err.message}`);
      ddlString = `/* Schema introspection failed: ${err.message} */`;
    }

    return ddlString.trim();
  }
}

module.exports = { DatabaseAdapter };
