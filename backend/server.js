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
// TEMPORARY DEBUG ROUTE — remove this once the webhook signature issue
// is confirmed fixed. It never reveals the actual secret — only its
// length and a masked first/last few characters, enough to confirm
// whether Render is actually running with the value you think it has.
// ---------------------------------------------------------------------
app.get('/debug/webhook-secret-check', (req, res) => {
  const secret = process.env.WHOP_WEBHOOK_SECRET || '';
  res.json({
    isSet: secret.length > 0,
    length: secret.length,
    startsWith: secret.slice(0, 6),
    endsWith: secret.slice(-4),
    containsLiteralEllipsis: secret.includes('...'),
    containsWhitespace: /\s/.test(secret),
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Caribbean Tech News backend listening on http://localhost:${PORT}`);
});
