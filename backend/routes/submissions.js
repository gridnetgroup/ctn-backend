const express = require('express');
const { customAlphabet } = require('nanoid');
const payment = require('../src/payment');
const db = require('../src/db');

const router = express.Router();

// CTNW-10482 style order numbers, matching the confirmation page copy
const numericId = customAlphabet('0123456789', 5);

const PRICE_USD = 99; // $99 — the one and only price

/**
 * Step 2 -> Step 3 on the frontend: called when the person clicks
 * "Confirm & Continue to Payment" on the Review screen.
 *
 * This does NOT charge anything itself. It creates a "pending_payment" row
 * so we have somewhere to attach the gateway's order reference, then hands
 * back a checkout URL — hosted by Whop, not us — for the browser to
 * redirect to. The submission only becomes real (pending_review) once the
 * webhook in routes/webhook.js independently confirms the payment actually
 * succeeded.
 */
router.post('/checkout', async (req, res) => {
  try {
    const {
      company, contactName, email, website,
      headline, body, imageUrl, keywords, mediaContact, publishDate,
    } = req.body;

    if (!company || !contactName || !email || !headline || !body) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const id = `CTNW-${numericId()}`;

    const submission = db.createPendingSubmission({
      id, company, contactName, email, website,
      headline, body, imageUrl, keywords, mediaContact, publishDate,
    });

    const { checkoutUrl, gatewayOrderToken } = await payment.createHostedCheckout({
      submissionId: id,
      amountUsd: PRICE_USD,
      description: `Press release: ${headline}`.slice(0, 250),
      customerEmail: email,
      redirectUrl: `${process.env.FRONTEND_URL}/index.html?paid=1&ref=${id}`,
    });

    db.attachGatewayOrderToken(id, gatewayOrderToken);

    res.json({ checkoutUrl, submissionId: id });
  } catch (err) {
    console.error('[checkout] failed:', err);
    res.status(500).json({ error: 'Could not start checkout.' });
  }
});

/**
 * Note: this router only exposes /checkout, and only that one is meant to
 * be public. Listing or reading individual submissions (which includes
 * names, emails, and unpublished press releases) now lives under
 * /api/admin/submissions in routes/admin.js instead — behind a login. An
 * earlier version of this file also had GET / and GET /:id here, with no
 * authentication at all; that was a real data exposure, not just an
 * incomplete feature, and has been removed rather than protected in place.
 */

module.exports = router;
