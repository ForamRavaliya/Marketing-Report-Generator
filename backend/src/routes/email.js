const express = require('express');
const router = express.Router();

const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendReportEmail } = require('../services/emailService');

router.use(authenticate);

router.get('/settings/:clientId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM client_email_settings
       WHERE client_id = $1 AND agency_id = $2
       LIMIT 1`,
      [req.params.clientId, req.user.agency_id]
    );

    res.json(
      result.rows[0] || {
        enabled: false,
        recipient_email: '',
        cc_email: '',
        send_day: 1,
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch email settings' });
  }
});

router.put('/settings/:clientId', async (req, res) => {
  try {
    const { enabled, recipient_email, cc_email, send_day } = req.body;

    const result = await db.query(
      `INSERT INTO client_email_settings
       (agency_id, client_id, enabled, recipient_email, cc_email, send_day, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)
       ON CONFLICT (client_id)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         recipient_email = EXCLUDED.recipient_email,
         cc_email = EXCLUDED.cc_email,
         send_day = EXCLUDED.send_day,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        req.user.agency_id,
        req.params.clientId,
        Boolean(enabled),
        recipient_email || null,
        cc_email || null,
        Number(send_day || 1),
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save email settings' });
  }
});

router.post('/test', async (req, res) => {
  try {
    const { email } = req.body;

    await sendReportEmail({
      to: email,
      subject: 'Augmetic Email Test',
      html: `
        <h2>Email Working ✅</h2>
        <p>This email was sent successfully from Augmetic.</p>
      `,
    });

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;