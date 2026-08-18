const express = require('express');
const db = require('../src/db');
const { sendApprovedNotice, sendPublishedNotice } = require('../src/email');
const { login, logout, requireAuth } = require('../src/auth');

const router = express.Router();

// -----------------------------------------------------------------------
// Everything in this file is mounted at /api/admin. Login and logout are
// public (you need to be able to reach them without already being logged
// in); everything else requires a valid session — see the router.use()
// below, which applies requireAuth to every route registered after it.
// -----------------------------------------------------------------------

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  let token;
  try {
    token = login(password);
  } catch (err) {
    // EDITOR_PASSWORD isn't configured on the server — a setup problem,
    // not a wrong-password problem, so it gets a different status code.
    console.error('[auth] login failed:', err.message);
    return res.status(500).json({ error: 'Login is not configured on the server yet.' });
  }
  if (!token) return res.status(401).json({ error: 'Incorrect password.' });
  res.json({ token });
});

router.post('/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization.slice('Bearer '.length);
  logout(token);
  res.json({ ok: true });
});

// Everything below this line requires a valid session.
router.use(requireAuth);

/** Editor console reads from here instead of a hardcoded array. */
router.get('/submissions', (req, res) => {
  const { status } = req.query;
  res.json(db.listSubmissions(status));
});

router.get('/submissions/:id', (req, res) => {
  const submission = db.getSubmission(req.params.id);
  if (!submission) return res.status(404).json({ error: 'Not found' });
  res.json(submission);
});

router.post('/submissions/:id/approve', async (req, res) => {
  const submission = db.updateStatus(req.params.id, 'approved');
  if (!submission) return res.status(404).json({ error: 'Not found' });

  try {
    await sendApprovedNotice(submission); // Email #2
  } catch (err) {
    console.error('[approve] status updated but notice email failed:', err);
  }

  res.json(submission);
});

router.post('/submissions/:id/reject', (req, res) => {
  const submission = db.updateStatus(req.params.id, 'rejected');
  if (!submission) return res.status(404).json({ error: 'Not found' });
  res.json(submission);
});

router.post('/submissions/:id/publish', async (req, res) => {
  const submission = db.updateStatus(req.params.id, 'published');
  if (!submission) return res.status(404).json({ error: 'Not found' });

  const liveUrl = `${process.env.FRONTEND_URL}/archive.html#${submission.id}`;

  try {
    await sendPublishedNotice(submission, liveUrl); // Email #3
  } catch (err) {
    console.error('[publish] status updated but notice email failed:', err);
  }

  res.json({ ...submission, liveUrl });
});

module.exports = router;
