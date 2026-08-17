const express = require('express');
const payment = require('../src/payment');
const db = require('../src/db');
const { sendPaymentConfirmation, sendEditorAlert } = require('../src/email');

const router = express.Router();

/**
 * Whop POSTs here for every event on your account. This is the ONLY place
 * that should ever move a submission from "pending_payment" to
 * "pending_review".
 *
 * Unlike the DimePay version of this file, this does NOT need a re-fetch
 * safety net — Whop's SDK verifies the request signature for us
 * (client.webhooks.unwrap follows the Standard Webhooks spec), so a request
 * that doesn't genuinely come from Whop is rejected outright, before we
 * even look at its contents.
 *
 * IMPORTANT: this route needs the RAW request body (not JSON-parsed) for
 * signature verification to work — see the express.raw() below and the
 * matching note in server.js about route ordering.
 */
router.post('/whop', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = payment.unwrapWebhook(req.body.toString('utf8'), req.headers);
  } catch (err) {
    console.error('[webhook] signature verification failed:', err.message);
    return res.status(400).send('Invalid signature');
  }

  // Whop's own docs say "payment.succeeded" (dot notation), but the live
  // dashboard's event picker shows "payment_succeeded" (underscore) — a
  // real, first-hand mismatch between their documentation and their
  // current product. Rather than bet on one and risk silently ignoring
  // every real payment, this accepts either spelling.
  const isPaymentSucceeded = event.type === 'payment.succeeded' || event.type === 'payment_succeeded';

  if (isPaymentSucceeded) {
    const paymentData = event.data;
    const submissionId = paymentData.metadata?.submission_id;

    if (!submissionId) {
      console.error(`[webhook] ${event.type} with no submission_id in metadata:`, paymentData.metadata);
      return res.status(200).json({ received: true }); // ack anyway — nothing to retry
    }

    const submission = db.getSubmission(submissionId);
    if (!submission) {
      console.error(`[webhook] no local submission found for id ${submissionId}`);
      return res.status(200).json({ received: true });
    }

    if (submission.status !== 'pending_payment') {
      // Already processed — webhooks can be delivered more than once.
      return res.status(200).json({ received: true });
    }

    const updated = db.markPaid(submissionId, paymentData.id);

    try {
      await sendPaymentConfirmation(updated);
    } catch (err) {
      console.error('[webhook] payment confirmation email failed:', err);
    }
    try {
      await sendEditorAlert(updated);
    } catch (err) {
      console.error('[webhook] editor alert email failed:', err);
    }
  }

  // payment.failed and other event types are safe to ignore here for now.

  res.json({ received: true });
});

module.exports = router;
