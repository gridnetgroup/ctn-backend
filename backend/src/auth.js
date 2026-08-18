// ---------------------------------------------------------------------------
// Simple shared-password auth for the editor console. This is intentionally
// minimal — one password for the whole team, not per-person accounts —
// which matches a small editorial team. If that ever needs to grow into
// real per-editor accounts with different permissions, this file is where
// that work would start.
//
// Sessions live in memory (a Map), not the database. That means everyone
// gets logged out if the server restarts or redeploys — an acceptable
// trade-off for a small team, and far simpler than the alternative. If
// that becomes annoying, swap the Map for a row in src/db.js the same way
// submissions are stored.
// ---------------------------------------------------------------------------
const crypto = require('crypto');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const sessions = new Map(); // token -> expiresAt (epoch ms)

/**
 * Checks the given password against EDITOR_PASSWORD using a timing-safe
 * comparison (so an attacker can't guess the password one character at a
 * time by measuring how long the comparison takes). Returns a fresh
 * session token on success, or null on failure.
 */
function login(password) {
  const expected = process.env.EDITOR_PASSWORD;
  if (!expected) {
    throw new Error('EDITOR_PASSWORD is not configured on the server.');
  }

  const provided = Buffer.from(password || '', 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const matches = provided.length === expectedBuf.length && crypto.timingSafeEqual(provided, expectedBuf);
  if (!matches) return null;

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isValid(token) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function logout(token) {
  sessions.delete(token);
}

/** Express middleware — apply to any route that should require login. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!isValid(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { login, logout, requireAuth };
