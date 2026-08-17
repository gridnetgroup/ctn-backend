require('dotenv').config();
const express = require('express');
const cors = require('cors');

const submissionsRouter = require('./routes/submissions');
const adminRouter = require('./routes/admin');
const webhookRouter = require('./routes/webhook');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// IMPORTANT: the Whop webhook route must be registered BEFORE
// express.json(), and must receive the raw request body. Whop signs the
// raw body (Standard Webhooks spec) — if anything has already
// parsed/re-serialized it, signature verification in routes/webhook.js
// will always fail.
app.use('/api/webhooks', webhookRouter);

app.use(express.json());

app.use('/api/submissions', submissionsRouter);
app.use('/api/admin/submissions', adminRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------
// TEMPORARY DEBUG ROUTE — checks whether the secret Render is actually
// running with is well-formed AFTER the ws_ -> whsec_ translation, since
// the translation fix alone doesn't help if the underlying value pasted
// into Render is itself truncated, has stray whitespace, or is simply
// the wrong secret. Never exposes the real value.
// ---------------------------------------------------------------------
app.get('/debug/webhook-secret-check', (req, res) => {
  const { whopSecretToStandardWebhooksFormat } = require('./src/payment');
  const raw = process.env.WHOP_WEBHOOK_SECRET || '';
  const translated = whopSecretToStandardWebhooksFormat(raw);

  let base64Valid = false;
  let base64Error = null;
  if (translated && translated.startsWith('whsec_')) {
    try {
      const b64part = translated.slice('whsec_'.length);
      const decoded = Buffer.from(b64part, 'base64');
      // A real round-trip check: re-encoding should match the original
      // (loosely) — this catches garbage that Buffer.from silently
      // tolerates instead of throwing on.
      base64Valid = decoded.length > 0 && Buffer.from(decoded).toString('base64').replace(/=+$/, '') === b64part.replace(/=+$/, '');
    } catch (err) {
      base64Error = err.message;
    }
  }

  res.json({
    rawIsSet: raw.length > 0,
    rawLength: raw.length,
    rawStartsWith: raw.slice(0, 4),
    rawEndsWith: raw.slice(-4),
    rawContainsWhitespace: /\s/.test(raw),
    rawContainsLiteralEllipsis: raw.includes('...'),
    translatedPrefix: translated ? translated.slice(0, 6) : null,
    base64Valid,
    base64Error,
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Caribbean Tech News backend listening on http://localhost:${PORT}`);
});
