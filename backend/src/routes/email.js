/*
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
    console.log('📧 Test email route hit');
    console.log('📧 Body:', req.body);
    console.log('📧 SMTP USER:', process.env.SMTP_USER);
    console.log('📧 SMTP FROM:', process.env.SMTP_FROM_EMAIL);

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

const info = await sendReportEmail({
  to: email,
  subject: 'Augmetic Email Test',
  html: `
    <h2>Email Working ✅</h2>
    <p>This email was sent successfully from Augmetic.</p>
  `,
});

console.log('✅ Test email send result');
console.log('📧 Message ID:', info.messageId);
console.log('📧 Accepted:', info.accepted);
console.log('📧 Rejected:', info.rejected);
console.log('📧 Response:', info.response);

    res.json({
      success: true,
      message: 'Email sent successfully',
    });
  } catch (err) {
    console.error('❌ Test email error:', err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
*/

const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const router = express.Router();

const db = require('../db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const { sendReportEmail, sendGmailOAuthEmail } = require('../utils/emailService');
const {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  refreshGoogleAccessToken,
  getGoogleUserInfo,
} = require('../utils/googleOAuthService');

router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) throw new Error(String(error));
    if (!code || !state) throw new Error('Google OAuth callback is missing code or state');

    const payload = jwt.verify(String(state), JWT_SECRET);
    const tokenData = await exchangeCodeForTokens(String(code));
    const userInfo = await getGoogleUserInfo(tokenData.access_token);
    const email = String(userInfo.email || '').toLowerCase();

    if (!email || !tokenData.refresh_token) {
      throw new Error('Google did not return a Gmail refresh token. Please reconnect and approve access.');
    }

    const userResult = await db.query(
      `SELECT email
       FROM users
       WHERE id = $1 AND agency_id = $2
       LIMIT 1`,
      [payload.userId, payload.agencyId]
    );
    const loginEmail = String(userResult.rows[0]?.email || '').toLowerCase();

    if (!loginEmail || email !== loginEmail) {
      throw new Error('Connected Google account must match the logged-in manager email.');
    }

    await db.query(
      `INSERT INTO user_email_connections
       (user_id, agency_id, provider, email, refresh_token, scope, connected_at, updated_at)
       VALUES ($1,$2,'google',$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, provider)
       DO UPDATE SET
         agency_id = EXCLUDED.agency_id,
         email = EXCLUDED.email,
         refresh_token = EXCLUDED.refresh_token,
         scope = EXCLUDED.scope,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [payload.userId, payload.agencyId, email, tokenData.refresh_token, tokenData.scope || null]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectPath = payload.returnTo || '/dashboard';
    res.redirect(`${frontendUrl.replace(/\/$/, '')}${redirectPath}?gmail=connected`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl.replace(/\/$/, '')}/dashboard?gmail=failed`);
  }
});

router.use(authenticate);

const allowedPlans = new Set(['pro', 'agency']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getPlanName = async (agencyId) => {
  const result = await db.query(
    `SELECT plan_name
     FROM subscriptions
     WHERE agency_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [agencyId]
  );

  return String(result.rows[0]?.plan_name || 'free').toLowerCase();
};

const requireEmailPlan = async (req, res) => {
  const planName = await getPlanName(req.user.agency_id);

  if (!allowedPlans.has(planName)) {
    res.status(403).json({ error: 'Email Reports are available only on Pro and Agency plans' });
    return false;
  }

  return true;
};

const getClientForAgency = async (clientId, agencyId) => {
  const result = await db.query(
    `SELECT id, name, contact_email
     FROM clients
     WHERE id = $1 AND agency_id = $2
     LIMIT 1`,
    [clientId, agencyId]
  );

  return result.rows[0] || null;
};

const normalizeSettings = (row = {}) => ({
  enabled: Boolean(row.enabled),
  recipient_email: row.recipient_email || '',
  cc_email: row.cc_email || '',
  send_day: Number(row.send_day || 1),
  last_sent_month: row.last_sent_month || null,
});

const validateSettings = ({ recipient_email, cc_email, send_day }) => {
  const day = Number(send_day || 1);

  if (!Number.isInteger(day) || day < 1 || day > 28) {
    return 'Send day must be between 1 and 28';
  }

  if (recipient_email && !emailPattern.test(String(recipient_email).trim())) {
    return 'Recipient email is invalid';
  }

  if (cc_email && !emailPattern.test(String(cc_email).trim())) {
    return 'CC email is invalid';
  }

  return null;
};

const getPreviousMonthRange = (today = new Date()) => {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    month: start.toISOString().slice(0, 7),
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

const getReportLocalPath = (filePath) => {
  if (!filePath) return null;

  const fileName = path.basename(String(filePath));
  const localPath = path.join(__dirname, '../../data/reports', fileName);

  return fs.existsSync(localPath) ? localPath : null;
};

const findExistingReport = async ({ clientId, agencyId, start, end }) => {
  const result = await db.query(
    `SELECT *
     FROM generated_reports
     WHERE client_id = $1
       AND agency_id = $2
       AND date_range_start = $3::date
       AND date_range_end = $4::date
       AND file_path IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId, agencyId, start, end]
  );

  const report = result.rows[0];
  if (!report) return null;

  const attachmentPath = getReportLocalPath(report.file_path);
  if (!attachmentPath) return null;

  return {
    report,
    attachmentPath,
    attachmentName: path.basename(attachmentPath),
  };
};

const generateReportViaApi = async ({ req, clientId, clientName, start, end }) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return;

  const baseUrl =
    process.env.INTERNAL_API_BASE_URL ||
    process.env.API_BASE_URL ||
    `http://localhost:${process.env.PORT || 5000}/api`;

  await axios.post(
    `${baseUrl.replace(/\/$/, '')}/reports/generate`,
    {
      clientId,
      dateStart: start,
      dateEnd: end,
      title: `${clientName} Monthly Report`,
      includeComparison: true,
    },
    {
      headers: { Authorization: authHeader },
      timeout: 120000,
    }
  );
};

const ensureMonthlyReport = async ({ req, client, monthRange }) => {
  const existingReport = await findExistingReport({
    clientId: client.id,
    agencyId: req.user.agency_id,
    start: monthRange.start,
    end: monthRange.end,
  });

  if (existingReport) return existingReport;

  await generateReportViaApi({
    req,
    clientId: client.id,
    clientName: client.name,
    start: monthRange.start,
    end: monthRange.end,
  });

  return findExistingReport({
    clientId: client.id,
    agencyId: req.user.agency_id,
    start: monthRange.start,
    end: monthRange.end,
  });
};

const insertEmailLog = async ({
  clientId,
  agencyId,
  sentBy,
  recipientEmail,
  ccEmail,
  reportMonth,
  subject,
  status,
  errorMessage,
}) => {
  await db.query(
    `INSERT INTO email_report_logs
     (client_id, agency_id, sent_by, recipient_email, cc_email, report_month, subject, status, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [clientId, agencyId, sentBy, recipientEmail, ccEmail || null, reportMonth, subject, status, errorMessage || null]
  );
};

const getUserGmailConnection = async (userId, agencyId) => {
  const result = await db.query(
    `SELECT *
     FROM user_email_connections
     WHERE user_id = $1
       AND agency_id = $2
       AND provider = 'google'
     LIMIT 1`,
    [userId, agencyId]
  );

  return result.rows[0] || null;
};

const sendEmailFromPreferredSender = async ({
  user,
  to,
  cc,
  subject,
  html,
  attachmentPath,
  attachmentName,
}) => {
  const gmailConnection = await getUserGmailConnection(user.id, user.agency_id);

  if (gmailConnection?.refresh_token) {
    const accessToken = await refreshGoogleAccessToken(gmailConnection.refresh_token);

    await sendGmailOAuthEmail({
      fromEmail: gmailConnection.email,
      accessToken,
      to,
      cc,
      subject,
      html,
      attachmentPath,
      attachmentName,
    });

    return {
      provider: 'google',
      fromEmail: gmailConnection.email,
    };
  }

  await sendReportEmail({
    to,
    cc,
    replyTo: user.email,
    subject,
    html,
    attachmentPath,
    attachmentName,
  });

  return {
    provider: 'smtp',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || null,
  };
};

router.get('/google/status', async (req, res) => {
  try {
    if (!(await requireEmailPlan(req, res))) return;

    const connection = await getUserGmailConnection(req.user.id, req.user.agency_id);

    res.json({
      connected: Boolean(connection),
      email: connection?.email || null,
      provider: connection ? 'google' : 'smtp',
    });
  } catch (err) {
    console.error('Google email status error:', err);
    res.status(500).json({ error: 'Failed to fetch Gmail connection status' });
  }
});

router.post('/google/connect', async (req, res) => {
  try {
    if (!(await requireEmailPlan(req, res))) return;

    const returnTo = String(req.body.returnTo || `/clients/${req.body.clientId || ''}`).replace(/\/+$/, '');
    const state = jwt.sign(
      {
        userId: req.user.id,
        agencyId: req.user.agency_id,
        returnTo: returnTo || '/dashboard',
      },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({ url: getGoogleAuthUrl({ state }) });
  } catch (err) {
    console.error('Google connect URL error:', err);
    res.status(500).json({ error: 'Failed to start Google connection' });
  }
});

router.delete('/google/connect', async (req, res) => {
  try {
    if (!(await requireEmailPlan(req, res))) return;

    await db.query(
      `DELETE FROM user_email_connections
       WHERE user_id = $1 AND agency_id = $2 AND provider = 'google'`,
      [req.user.id, req.user.agency_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Google disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect Gmail' });
  }
});

router.get('/settings/:clientId', async (req, res) => {
  try {
    if (!(await requireEmailPlan(req, res))) return;

    const client = await getClientForAgency(req.params.clientId, req.user.agency_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const result = await db.query(
      `SELECT *
       FROM client_email_settings
       WHERE client_id = $1 AND agency_id = $2
       LIMIT 1`,
      [req.params.clientId, req.user.agency_id]
    );

    res.json(normalizeSettings(result.rows[0]));
  } catch (err) {
    console.error('Email settings fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch email settings' });
  }
});

const saveSettingsHandler = async (req, res) => {
  try {
    if (!(await requireEmailPlan(req, res))) return;

    const client = await getClientForAgency(req.params.clientId, req.user.agency_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const { enabled, recipient_email, cc_email, send_day } = req.body;
    const validationError = validateSettings({ recipient_email, cc_email, send_day });
    if (validationError) return res.status(400).json({ error: validationError });

    const result = await db.query(
      `INSERT INTO client_email_settings
       (agency_id, client_id, enabled, recipient_email, cc_email, send_day, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)
       ON CONFLICT (client_id, agency_id)
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
        recipient_email ? String(recipient_email).trim() : null,
        cc_email ? String(cc_email).trim() : null,
        Number(send_day || 1),
      ]
    );

    res.json(normalizeSettings(result.rows[0]));
  } catch (err) {
    console.error('Email settings save error:', err);
    res.status(500).json({ error: 'Failed to save email settings' });
  }
};

router.post('/settings/:clientId', saveSettingsHandler);
router.put('/settings/:clientId', saveSettingsHandler);

router.post('/test', async (req, res) => {
  try {
    if (!(await requireEmailPlan(req, res))) return;

    const to = String(req.body.recipient_email || req.body.to || req.body.email || '').trim();
    const cc = String(req.body.cc_email || req.body.cc || '').trim();

    if (!to) return res.status(400).json({ error: 'Recipient email is required' });
    const validationError = validateSettings({ recipient_email: to, cc_email: cc, send_day: 1 });
    if (validationError) return res.status(400).json({ error: validationError });

    const sentFrom = await sendEmailFromPreferredSender({
      user: req.user,
      to,
      cc,
      subject: 'Monthly Report Email Test',
      html: `
        <p>This is a test email from Performance Marketing Report Generator.</p>
        <p>If you received this email, monthly report email delivery is configured correctly.</p>
      `,
    });

    res.json({ success: true, message: 'Test email sent successfully', sentFrom });
  } catch (err) {
    console.error('Email send error:', err);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

router.post('/send-monthly/:clientId', async (req, res) => {
  const monthRange = getPreviousMonthRange();
  let settings;
  let client;
  let subject;

  try {
    if (!(await requireEmailPlan(req, res))) return;

    client = await getClientForAgency(req.params.clientId, req.user.agency_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const settingsResult = await db.query(
      `SELECT *
       FROM client_email_settings
       WHERE client_id = $1 AND agency_id = $2
       LIMIT 1`,
      [req.params.clientId, req.user.agency_id]
    );

    settings = normalizeSettings(settingsResult.rows[0]);
    if (!settings.recipient_email) {
      return res.status(400).json({ error: 'Recipient email is required before sending monthly report' });
    }

    if (settings.last_sent_month === monthRange.month) {
      return res.status(409).json({ error: `Monthly report for ${monthRange.month} has already been sent` });
    }

    const monthlyReport = await ensureMonthlyReport({ req, client, monthRange });
    if (!monthlyReport) {
      return res.status(404).json({
        error: `No generated PDF report found for ${monthRange.month}. Generate the previous month report first.`,
      });
    }

    subject = `${client.name} Monthly Marketing Report - ${monthRange.month}`;

    const sentFrom = await sendEmailFromPreferredSender({
      user: req.user,
      to: settings.recipient_email,
      cc: settings.cc_email,
      subject,
      html: `
        <p>Hello,</p>
        <p>Please find attached the monthly marketing report for ${client.name} covering ${monthRange.start} to ${monthRange.end}.</p>
        <p>Regards,<br/>${req.user.full_name || req.user.email}</p>
      `,
      attachmentPath: monthlyReport.attachmentPath,
      attachmentName: monthlyReport.attachmentName,
    });

    await db.query(
      `UPDATE client_email_settings
       SET last_sent_month = $1, updated_at = CURRENT_TIMESTAMP
       WHERE client_id = $2 AND agency_id = $3`,
      [monthRange.month, req.params.clientId, req.user.agency_id]
    );

    await insertEmailLog({
      clientId: req.params.clientId,
      agencyId: req.user.agency_id,
      sentBy: req.user.id,
      recipientEmail: settings.recipient_email,
      ccEmail: settings.cc_email,
      reportMonth: monthRange.month,
      subject,
      status: 'sent',
    });

    res.json({ success: true, message: 'Monthly report email sent', report_month: monthRange.month, sentFrom });
  } catch (err) {
    console.error('Email send error:', err);

    if (settings && client) {
      await insertEmailLog({
        clientId: req.params.clientId,
        agencyId: req.user.agency_id,
        sentBy: req.user.id,
        recipientEmail: settings.recipient_email,
        ccEmail: settings.cc_email,
        reportMonth: monthRange.month,
        subject: subject || `${client.name} Monthly Marketing Report - ${monthRange.month}`,
        status: 'failed',
        errorMessage: err.message,
      }).catch((logErr) => console.error('Email log error:', logErr));
    }

    res.status(500).json({ error: 'Failed to send monthly report email' });
  }
});

module.exports = {
  router,
  getPreviousMonthRange,
  findExistingReport,
  insertEmailLog,
};
