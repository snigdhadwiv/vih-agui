/**
 * Agentic UI — security middleware
 * ---------------------------------
 * Three independent protections, all opt-in-by-default-safe:
 *
 * 1. CORS — only localhost/127.0.0.1 origins (any port) are allowed unless
 *    you explicitly add more via AGENTIC_UI_ALLOWED_ORIGINS (comma-separated).
 *    Requests with no Origin header (curl, server-to-server) pass through,
 *    since CORS is a browser-enforced concept.
 *
 * 2. Auth — if AGENTIC_UI_TOKEN is set, every request to /chat and /apply
 *    must carry `Authorization: Bearer <token>`. If it's NOT set, the server
 *    still works (so solo local testing has zero setup) but prints a loud
 *    warning on every boot, because an unauthenticated file-write endpoint
 *    is not something to run unattended.
 *
 * 3. Rate limiting — simple in-memory sliding window per IP. Cheap
 *    protection against a runaway loop or a stray script hammering your
 *    LLM bill or your disk.
 */

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function corsMiddleware() {
  const extraAllowed = (process.env.AGENTIC_UI_ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (LOCAL_ORIGIN_RE.test(origin) || extraAllowed.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}

function authMiddleware() {
  const token = process.env.AGENTIC_UI_TOKEN;
  return (req, res, next) => {
    if (!token) return next(); // unauthenticated mode — caller is warned at boot
    const header = req.headers.authorization || "";
    const provided = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (provided !== token) {
      return res.status(401).json({ error: "Missing or invalid Authorization bearer token." });
    }
    next();
  };
}

function rateLimitMiddleware({ windowMs = 5 * 60 * 1000, max = 60 } = {}) {
  const hits = new Map(); // ip -> array of timestamps
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(ip, arr);
    if (arr.length > max) {
      return res.status(429).json({ error: `Rate limit exceeded (${max} requests / ${Math.round(windowMs / 60000)} min).` });
    }
    next();
  };
}

module.exports = { corsMiddleware, authMiddleware, rateLimitMiddleware, LOCAL_ORIGIN_RE };
