// ---------------------------------------------------------------------------
// Transactional email via Resend (resend.com). Swap the `Resend` client for
// Postmark, SES, or anything else — every call site in this project just
// calls the functions exported below.
//
// Three emails in the sequence, matching the submitter's journey:
//   1. sendPaymentConfirmation — fired from the webhook the moment Whop
//      confirms payment. Never call this from a client request.
//   2. sendApprovedNotice — fired when an editor clicks Approve in the
//      admin console.
//   3. sendPublishedNotice — fired when an editor clicks Publish. Contains
//      the actual live URL.
// ---------------------------------------------------------------------------
const { Resend } = require('resend');

const FROM_ADDRESS = process.env.FROM_EMAIL || 'Caribbean Tech News <releases@caribbeantechnews.com>';

// Built lazily (only when an email actually needs to send) rather than at
// require-time. Constructing the Resend client eagerly with no API key
// throws immediately and takes down the whole server on startup — which is
// exactly what happened the first time this deployed without
// RESEND_API_KEY set. Emails not sending is a much smaller problem than
// the entire backend refusing to boot.
let resend = null;
function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY is not set — skipping this email. Everything else (payment, admin queue) still works.');
    return null;
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * Email #1 — Payment Received.
 * Sent immediately after Whop confirms payment (from the webhook
 * handler, never from the client).
 */
async function sendPaymentConfirmation(submission) {
  const client = getResendClient();
  if (!client) return null;
  const { email, contactName, company, headline, id } = submission;

  return client.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: `Payment received — ${headline}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #16232A;">
        <p style="font-family: monospace; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #8FD3C4; background:#0D2B2E; display:inline-block; padding:6px 12px; border-radius:20px;">
          Payment received
        </p>
        <h1 style="font-size: 22px; margin-top: 20px;">Thanks, ${contactName || company}.</h1>
        <p style="font-size: 15px; line-height: 1.6; color: #4A5A56;">
          We've received your $99 payment and press release for <strong>${headline}</strong>.
          Our editorial team reviews every submission against our editorial guidelines and publishes within 48 hours.
        </p>
        <table style="width:100%; margin-top: 24px; border-top: 1px solid #ECE4CC; padding-top: 16px; font-size: 14px;">
          <tr><td style="color:#7A8C86; padding: 6px 0;">Order #</td><td style="text-align:right; font-family:monospace;">${id}</td></tr>
          <tr><td style="color:#7A8C86; padding: 6px 0;">Company</td><td style="text-align:right;">${company}</td></tr>
          <tr><td style="color:#7A8C86; padding: 6px 0;">Amount paid</td><td style="text-align:right;">$99.00 USD</td></tr>
        </table>
        <p style="font-size: 13px; color: #7A8C86; margin-top: 28px;">
          Next up: you'll hear from us again once your release is approved, and a third time the moment it's live.
        </p>
      </div>
    `,
  });
}

/**
 * Email #2 — Release Approved / In Production.
 * Sent when an editor clicks "Approve" in the admin console — this tells
 * the submitter their piece cleared editorial review and is queued to go
 * live, before it's actually published.
 */
async function sendApprovedNotice(submission) {
  const client = getResendClient();
  if (!client) return null;
  const { email, contactName, company, headline } = submission;

  return client.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: `Approved — ${headline}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #16232A;">
        <p style="font-family: monospace; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #8FD3C4; background:#0D2B2E; display:inline-block; padding:6px 12px; border-radius:20px;">
          Approved
        </p>
        <h1 style="font-size: 22px; margin-top: 20px;">Good news, ${contactName || company}.</h1>
        <p style="font-size: 15px; line-height: 1.6; color: #4A5A56;">
          Your release, <strong>${headline}</strong>, has been reviewed and is now scheduled for publication.
        </p>
        <p style="font-size: 13px; color: #7A8C86; margin-top: 20px;">
          You'll get one more email — with the live link — the moment it goes out on the wire.
        </p>
      </div>
    `,
  });
}

/**
 * Email #3 — Published.
 * Sent when an editor clicks "Publish" in the admin console — the actual
 * "you're live" moment. Contains the live URL.
 */
async function sendPublishedNotice(submission, liveUrl) {
  const client = getResendClient();
  if (!client) return null;
  const { email, contactName, company, headline } = submission;

  return client.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: `You're live — ${headline}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #16232A;">
        <p style="font-family: monospace; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #8FD3C4; background:#0D2B2E; display:inline-block; padding:6px 12px; border-radius:20px;">
          Published
        </p>
        <h1 style="font-size: 22px; margin-top: 20px;">You're live, ${contactName || company}.</h1>
        <p style="font-size: 15px; line-height: 1.6; color: #4A5A56;">
          Your press release, <strong>${headline}</strong>, is now live on Caribbean Tech News.
        </p>
        <a href="${liveUrl}" style="display:inline-block; margin-top:16px; background:#E8A33D; color:#0D2B2E; padding:12px 22px; border-radius:4px; text-decoration:none; font-weight:bold;">
          Your release is live →
        </a>
      </div>
    `,
  });
}

/** Sent to your internal editor inbox/Slack-via-email so nothing sits unnoticed. */
async function sendEditorAlert(submission) {
  const editorInbox = process.env.EDITOR_ALERT_EMAIL;
  if (!editorInbox) return; // optional — skip silently if not configured
  const client = getResendClient();
  if (!client) return null;

  return client.emails.send({
    from: FROM_ADDRESS,
    to: editorInbox,
    subject: `New release awaiting review — ${submission.company}`,
    html: `
      <p>A new paid submission is waiting in the queue:</p>
      <p><strong>${submission.headline}</strong><br>${submission.company} — ${submission.email}</p>
      <p><a href="${process.env.ADMIN_URL || '#'}">Open the editor console</a></p>
    `,
  });
}

module.exports = { sendPaymentConfirmation, sendApprovedNotice, sendPublishedNotice, sendEditorAlert };
