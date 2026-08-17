const express = require('express');
const db = require('../src/db');
const { sendApprovedNotice, sendPublishedNotice } = require('../src/email');

const router = express.Router();

// -----------------------------------------------------------------------
// NOTE: none of these routes check who's calling them. Before this goes
// live, put real auth in front of everything under /api/admin — e.g. a
// session cookie set by a real login page, checked in a middleware here.
// Right now admin.html has no login at all, so treat this whole router as
// unprotected until that's built.
// -----------------------------------------------------------------------

router.post('/:id/approve', async (req, res) => {
  const submission = db.updateStatus(req.params.id, 'approved');
  if (!submission) return res.status(404).json({ error: 'Not found' });

  try {
    await sendApprovedNotice(submission); // Email #2
  } catch (err) {
    // Approval already succeeded — don't fail the request over a flaky
    // email send. Log it and let a human notice.
    console.error('[approve] status updated but notice email failed:', err);
  }

  res.json(submission);
});

router.post('/:id/reject', (req, res) => {
  const submission = db.updateStatus(req.params.id, 'rejected');
  if (!submission) return res.status(404).json({ error: 'Not found' });
  res.json(submission);
});

router.post('/:id/publish', async (req, res) => {
  const submission = db.updateStatus(req.params.id, 'published');
  if (!submission) return res.status(404).json({ error: 'Not found' });

  const liveUrl = `${process.env.FRONTEND_URL}/archive.html#${submission.id}`;

  try {
    await sendPublishedNotice(submission, liveUrl);
  } catch (err) {
    // Publishing already succeeded — don't fail the request just because
    // the "you're live" email had a hiccup. Log it and let a human notice.
    console.error('[publish] status updated but notice email failed:', err);
  }

  res.json({ ...submission, liveUrl });
});

module.exports = router;
