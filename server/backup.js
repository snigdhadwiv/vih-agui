/**
 * Agentic UI — backups + audit log
 * ----------------------------------
 * Every /apply first snapshots the file it's about to overwrite (if it
 * exists) into .agentic-ui/backups/, then appends one JSON line to
 * .agentic-ui/audit.log. This is not a substitute for git — commit your
 * work — but it means a bad generation is always one `agentic-ui undo`
 * away, even mid-session before you've committed anything.
 */
const fs = require("fs");
const path = require("path");

function backupsDir(root) {
  const dir = path.join(root, ".agentic-ui", "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function auditLogPath(root) {
  return path.join(root, ".agentic-ui", "audit.log");
}

function sanitizeForFilename(relPath) {
  return relPath.replace(/[\\/]/g, "__");
}

/** Snapshots the current file (if any) before it gets overwritten. */
function backupBeforeWrite(root, relPath) {
  const dir = backupsDir(root);
  const target = path.join(root, relPath);
  if (!fs.existsSync(target)) return null; // new file — nothing to back up
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(dir, `${stamp}__${sanitizeForFilename(relPath)}`);
  fs.copyFileSync(target, backupPath);
  return backupPath;
}

function appendAudit(root, entry) {
  fs.appendFileSync(auditLogPath(root), JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n");
}

/** Finds the most recent backup for a given relative path. */
function findLatestBackup(root, relPath) {
  const dir = backupsDir(root);
  const needle = `__${sanitizeForFilename(relPath)}`;
  const matches = fs.readdirSync(dir).filter((f) => f.endsWith(needle)).sort();
  if (!matches.length) return null;
  return path.join(dir, matches[matches.length - 1]);
}

module.exports = { backupBeforeWrite, appendAudit, findLatestBackup, backupsDir, auditLogPath };
