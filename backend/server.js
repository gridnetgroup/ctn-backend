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
app.use('/api/admin', adminRouter);

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

  res.json({
    rawIsSet: raw.length > 0,
    rawLength: raw.length,
    rawStartsWith: raw.slice(0, 4),
    rawEndsWith: raw.slice(-4),
    rawContainsWhitespace: /\s/.test(raw),
    rawContainsLiteralEllipsis: raw.includes('...'),
    translatedLength: translated ? translated.length : 0,
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Caribbean Tech News backend listening on http://localhost:${PORT}`);
});
