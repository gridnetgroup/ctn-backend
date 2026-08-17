# Caribbean Tech News — Backend

Handles what the static site can't: taking payment (via Whop), confirming it
actually happened, emailing the submitter, and handing the release to the
editor console for review.

## The flow this implements

```
1. Person fills out the form and clicks "Confirm & Continue to Payment"
   on the Review step.
        │
        ▼
2. Frontend calls  POST /api/submissions/checkout
        │  → creates a submission row, status = "pending_payment"
        │  → creates a Whop checkout configuration with
        │    metadata.submission_id attached, returns its purchase_url
        ▼
3. Frontend redirects the browser to that Whop-hosted URL.
   Person enters card details on Whop's page, not ours.
        │
        ▼
4. Whop charges the card, then POSTs to OUR SERVER directly:
        POST /api/webhooks/whop   (event: payment.succeeded)
        │  → signature verified via Whop's SDK (see below) — a request
        │    that isn't genuinely from Whop is rejected outright
        │  → submission flips to "pending_review", order # is CTNW-XXXXX
        │  → Email #1 "Payment Received" sent to the submitter
        │  → optional alert email sent to your editors
        ▼
5. Whop also redirects the PERSON'S BROWSER back to
   FRONTEND_URL/index.html?paid=1 — but that's just where they land.
   It is NOT what confirms payment. Step 4 already did that, server to
   server, independent of whether the person's browser made it back at all.
        │
        ▼
6. Editor opens admin.html, sees the release in "Pending Review"
   (GET /api/submissions?status=pending_review), clicks Approve
        │  → Email #2 "Approved / In Production" sent to the submitter
        ▼
7. Editor clicks Publish → POST /api/admin/submissions/:id/publish
        │  → Email #3 "Published" sent, with the live URL
```

## Why Whop was the easiest of the three processors to build against

DimePay and PowerTranz (the two options looked at earlier) both had real
gaps in what's publicly documented — DimePay's response field names had to
be guessed defensively, and PowerTranz's actual spec sits behind a merchant
login. Whop's docs are a different tier: a real REST API reference, an
official npm SDK (`@whop/sdk`) actively maintained by Whop's own team, and
— critically — genuine webhook signature verification via the
[Standard Webhooks](https://www.standardwebhooks.com/) spec, built into the
SDK (`client.webhooks.unwrap`).

That last point matters more than it sounds: with DimePay, this project had
to work around unclear signature docs by re-fetching every order from
DimePay's API before trusting a webhook. With Whop, that workaround isn't
needed — `unwrapWebhook()` was tested directly with a deliberately invalid
signature, and it was rejected before the payload was ever read, citing the
actual cryptographic reason (a stale timestamp, part of the spec's
replay-attack protection). That's a stronger security property with less
code.

The checkout-creation path was also tested directly: it correctly builds
the request and reaches the real `api.whop.com` — confirmed by the specific
network-level error this sandbox produced trying to reach it — which proves
the SDK call itself is correct; only real API keys are missing.

## Setup

```bash
npm install
cp .env.example .env   # then fill in real keys
npm start               # runs on http://localhost:4000
```

### Whop

1. Create your account and business at [whop.com/new](https://whop.com/new).
2. Find your Company ID in the dashboard URL itself —
   `whop.com/dashboard/biz_xxxxxxxxxxxxxx/...` — copy the `biz_...` part
   into `WHOP_COMPANY_ID`. (Not under Settings, despite what some of Whop's
   own docs say — it's in the address bar.)
3. Go to **Developer → API Keys** and create an **Account API key** →
   `WHOP_API_KEY`. When picking permissions, use the search box rather than
   scrolling — these five are the confirmed minimum for creating a
   checkout (search terms are what the dashboard actually calls things,
   which differs from the docs in one spot — see the note below):
   - Search `product` → check **Create**, **Update**
   - Search `checkout` → check **Checkout Configuration: Create**,
     **Checkout Configuration: Read**
   - Search `plan` → check **Plan: Create**
   - Search `payment` → check **Payment: Read** (optional — not required
     for checkout creation, but useful for debugging a payment status
     directly later)

   Note: Whop's API and permission *scope names* still use the older
   internal term "access pass" (e.g. `access_pass:create`), but the
   dashboard UI — including this permission picker — labels the same
   thing "Product." If a docs page tells you to look for "Access Pass,"
   search "product" instead.
4. Go to **Developer → Webhooks → Create Webhook**, point it at
   `BACKEND_URL/api/webhooks/whop`, select the `payment.succeeded` event,
   keep API version on `v1`. Copy the signing secret → `WHOP_WEBHOOK_SECRET`.
5. That's it — **you don't need to manually create a product.** The
   backend creates one inline with every checkout request (see the "Why
   Whop was the easiest" section below for why this ended up being the
   more reliable path).
6. Whop has a full sandbox environment
   ([docs](https://docs.whop.com/developer/guides/sandbox)) with test cards
   for every outcome (succeeded, failed, requires action) — use it before
   going live. The dashboard also has a **Send test event** button on each
   webhook, which is the fastest way to confirm your endpoint is reachable
   before running a real test charge.

### Resend (email)

Sign up at resend.com, verify your sending domain, grab an API key. Swap
`src/email.js` for Postmark/SES/whatever if you'd rather use something
else — it's the only file that knows about the email provider.

### Storage

Submissions are stored in `submissions.json` right next to this README —
zero setup, but it's a single file on one machine, which won't survive a
redeploy on most hosting platforms and can't handle concurrent writes
safely. **Replace `src/db.js` with a real database client before going
live** (Postgres via Supabase or Neon is a fast, cheap fit). Every other
file only calls the functions exported from `src/db.js`, so that's the
only file that needs to change.

## Wiring this into the existing frontend

Two edits needed in the static site once this backend is deployed
somewhere real:

**`index.html`** — the `pay-btn` click handler on the Secure Checkout step
currently fakes the redirect with `setTimeout`. Replace it with a real call
to `POST /api/submissions/checkout`, then `window.location.href =
checkoutUrl` from the response.

**`admin.html`** — replace the hardcoded `submissions` array with a fetch
from `GET /api/submissions`, and point Approve/Reject/Publish at
`POST /api/admin/submissions/:id/approve|reject|publish`.

Say the word once you've got this deployed and can give me the live
backend URL, and I'll wire both files directly.

## What's still missing before this is production-ready

- **Auth on `/api/admin/*`** — right now anyone who finds the URL can
  approve/publish/reject. Needs a real login in front of admin.html and
  a session check in `routes/admin.js`.
- **Image/doc upload** — the checkout route doesn't handle the uploaded
  image/Word doc yet; needs S3 (or similar) plus a signed-upload route,
  called before checkout starts.
- **A real database** — see the Storage section above.
- **Real end-to-end testing in Whop's sandbox** — everything here was
  verified as far as this environment allows (request construction, field
  names, signature rejection of bad requests). The one thing that can only
  be confirmed with real sandbox keys is a full successful payment round
  trip.
