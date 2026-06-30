const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const {
  getPreviousMonthRange,
  findExistingReport,
  insertEmailLog,
} = require('../routes/email');
const { sendReportEmail } = require('../utils/emailService');

const allowedPlans = new Set(['pro', 'agency']);

const getInternalAuthHeader = (userId) => {
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15m' });
  return `Bearer ${token}`;
};

const getReportGenerationUrl = () => {
  const baseUrl =
    process.env.INTERNAL_API_BASE_URL ||
    process.env.API_BASE_URL ||
    `http://localhost:${process.env.PORT || 5000}/api`;

  return `${baseUrl.replace(/\/$/, '')}/reports/generate`;
};

const generateReportIfMissing = async ({ setting, manager, client, monthRange }) => {
  const axios = require('axios');

  await axios.post(
    getReportGenerationUrl(),
    {
      clientId: setting.client_id,
      dateStart: monthRange.start,
      dateEnd: monthRange.end,
      title: `${client.name} Monthly Report`,
      includeComparison: true,
    },
    {
      headers: { Authorization: getInternalAuthHeader(manager.id) },
      timeout: 120000,
    }
  );
};

const sendOneMonthlyEmail = async (setting) => {
  const monthRange = getPreviousMonthRange();

  if (setting.last_sent_month === monthRange.month) return;

  const planName = String(setting.plan_name || 'free').toLowerCase();
  if (!allowedPlans.has(planName)) return;

  const manager = {
    id: setting.manager_id,
    email: setting.manager_email,
    full_name: setting.manager_name,
  };
  const client = {
    id: setting.client_id,
    name: setting.client_name,
  };
  const subject = `${client.name} Monthly Marketing Report - ${monthRange.month}`;

  try {
    let monthlyReport = await findExistingReport({
      clientId: setting.client_id,
      agencyId: setting.agency_id,
      start: monthRange.start,
      end: monthRange.end,
    });

    if (!monthlyReport) {
      await generateReportIfMissing({ setting, manager, client, monthRange });
      monthlyReport = await findExistingReport({
        clientId: setting.client_id,
        agencyId: setting.agency_id,
        start: monthRange.start,
        end: monthRange.end,
      });
    }

    if (!monthlyReport) {
      throw new Error(`No generated PDF report found for ${monthRange.month}`);
    }

    await sendReportEmail({
      to: setting.recipient_email,
      cc: setting.cc_email,
      replyTo: manager.email,
      subject,
      html: `
        <p>Hello,</p>
        <p>Please find attached the monthly marketing report for ${client.name} covering ${monthRange.start} to ${monthRange.end}.</p>
        <p>Regards,<br/>${manager.full_name || manager.email}</p>
      `,
      attachmentPath: monthlyReport.attachmentPath,
      attachmentName: monthlyReport.attachmentName,
    });

    await db.query(
      `UPDATE client_email_settings
       SET last_sent_month = $1, updated_at = CURRENT_TIMESTAMP
       WHERE client_id = $2 AND agency_id = $3`,
      [monthRange.month, setting.client_id, setting.agency_id]
    );

    await insertEmailLog({
      clientId: setting.client_id,
      agencyId: setting.agency_id,
      sentBy: manager.id,
      recipientEmail: setting.recipient_email,
      ccEmail: setting.cc_email,
      reportMonth: monthRange.month,
      subject,
      status: 'sent',
    });
  } catch (error) {
    console.error('Email send error:', error);

    await insertEmailLog({
      clientId: setting.client_id,
      agencyId: setting.agency_id,
      sentBy: manager.id,
      recipientEmail: setting.recipient_email,
      ccEmail: setting.cc_email,
      reportMonth: monthRange.month,
      subject,
      status: 'failed',
      errorMessage: error.message,
    }).catch((logError) => console.error('Email log error:', logError));
  }
};

const runMonthlyEmailReportJob = async () => {
  const today = new Date();
  const todayDay = today.getUTCDate();
  const monthRange = getPreviousMonthRange(today);

  const result = await db.query(
    `SELECT
       ces.*,
       c.name AS client_name,
       s.plan_name,
       u.id AS manager_id,
       u.email AS manager_email,
       u.full_name AS manager_name
     FROM client_email_settings ces
     JOIN clients c ON c.id = ces.client_id AND c.agency_id = ces.agency_id
     JOIN LATERAL (
       SELECT plan_name
       FROM subscriptions
       WHERE agency_id = ces.agency_id
       ORDER BY created_at DESC
       LIMIT 1
     ) s ON TRUE
     JOIN LATERAL (
       SELECT id, email, full_name
       FROM users
       WHERE agency_id = ces.agency_id
       ORDER BY
         CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
         created_at ASC
       LIMIT 1
     ) u ON TRUE
     WHERE ces.enabled = TRUE
       AND ces.recipient_email IS NOT NULL
       AND ces.send_day = $1
       AND COALESCE(ces.last_sent_month, '') <> $2`,
    [todayDay, monthRange.month]
  );

  for (const setting of result.rows) {
    await sendOneMonthlyEmail(setting);
  }
};

const startMonthlyEmailReportJob = () => {
  cron.schedule('15 9 * * *', () => {
    runMonthlyEmailReportJob().catch((error) => {
      console.error('Monthly email report job error:', error);
    });
  });
};

module.exports = {
  startMonthlyEmailReportJob,
  runMonthlyEmailReportJob,
};
