// ---------------------------------------------------------------------------
// Whop adapter, built from Whop's public developer docs (docs.whop.com) using
// their official SDK — @whop/sdk. Unlike the DimePay/PowerTranz research
// this replaced, every piece here (fields, endpoint behavior, webhook
// payload shape) is confirmed directly from Whop's docs and code samples,
// not inferred.
// ---------------------------------------------------------------------------
const Whop = require('@whop/sdk').default;

if (!process.env.WHOP_API_KEY) {
  console.warn('[whop] WHOP_API_KEY is not set — checkout will fail until it is.');
}
if (!process.env.WHOP_COMPANY_ID) {
  console.warn('[whop] WHOP_COMPANY_ID is not set — checkout will fail until it is.');
}

const client = new Whop({
  apiKey: process.env.WHOP_API_KEY || 'placeholder',
  // The underlying signature-verification library (standardwebhooks) only
  // recognizes secrets prefixed "whsec_" — that's the general convention
  // most Standard Webhooks implementations use. Whop's own dashboard,
  // though, hands out secrets prefixed "ws_" instead. Passed through
  // as-is, the library tries to base64-decode the literal "ws_" prefix
  // and fails immediately with a decoding error — confirmed directly by
  // reproducing it locally. This translates Whop's format to what the
  // library actually expects, so you can paste the secret exactly as
  // Whop shows it, with no manual editing.
  webhookKey: whopSecretToStandardWebhooksFormat(process.env.WHOP_WEBHOOK_SECRET),
});

function whopSecretToStandardWebhooksFormat(secret) {
  if (!secret) return null;
  return secret.startsWith('ws_') ? `whsec_${secret.slice(3)}` : secret;
}

/**
 * Step 2 -> Step 3: create a Whop checkout configuration for this specific
 * submission and get back a purchase_url — a Whop-hosted page, not ours —
 * to redirect the browser to.
 *
 * We use a fresh "inline plan" (and inline product) on every call rather
 * than referencing a pre-made product by ID. Two reasons:
 *   1. It lets us attach `metadata.submission_id` to THIS specific
 *      checkout — that metadata comes back untouched on the
 *      payment.succeeded webhook, which is how the webhook knows which
 *      submission got paid.
 *   2. Whop's own docs disagree with each other on the field name/prefix
 *      for referencing an existing product in this specific endpoint (one
 *      guide says `access_pass_id` / `pass_...`, the current dashboard and
 *      product-listing API both show `prod_...`). The nested `product`
 *      object below, by contrast, is confirmed directly from Whop's actual
 *      API reference schema for this endpoint — so this sidesteps the
 *      ambiguity entirely instead of guessing which name is current.
 *
 * Note on naming: Whop's permission scopes still use the internal name
 * "access_pass" (e.g. access_pass:create) for what the dashboard now
 * labels "Product" everywhere a human sees it — confirmed directly against
 * a real account's API key creation screen. If you're hunting for a
 * permission in the dashboard, search "product," not "access pass."
 */
async function createHostedCheckout({ submissionId, amountUsd, description, customerEmail, redirectUrl }) {
  const checkoutConfig = await client.checkoutConfigurations.create({
    currency: 'usd',
    plan: {
      company_id: process.env.WHOP_COMPANY_ID,
      initial_price: amountUsd,
      plan_type: 'one_time',
      description,
      product: {
        title: 'Press Release Distribution',
        description: 'Caribbean Tech News Wire — one press release, published within 48 hours.',
      },
    },
    metadata: {
      submission_id: submissionId,
      customer_email: customerEmail,
    },
    redirect_url: redirectUrl,
  });

  return {
    checkoutUrl: checkoutConfig.purchase_url,
    gatewayOrderToken: checkoutConfig.id, // ch_xxxxxxxxxxxxx
  };
}

/**
 * Verifies a webhook request really came from Whop (signature check via
 * their SDK, using the Standard Webhooks spec) and unwraps it into a typed
 * event. Throws if the signature doesn't check out — the route handler
 * should treat that as a rejected request, not a soft failure.
 */
function unwrapWebhook(rawBodyText, headers) {
  return client.webhooks.unwrap(rawBodyText, { headers });
}

module.exports = { createHostedCheckout, unwrapWebhook, whopSecretToStandardWebhooksFormat };
