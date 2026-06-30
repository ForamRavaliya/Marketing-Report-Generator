const nodemailer = require('nodemailer');

const getTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_PORT) === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const getFromAddress = () => {
  const fromName = process.env.SMTP_FROM_NAME || 'Marketing Report Generator';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  return `"${fromName}" <${fromEmail}>`;
};

async function sendReportEmail({
  to,
  cc,
  subject,
  html,
  attachmentPath,
  attachmentName,
  replyTo,
}) {
  const attachments = attachmentPath
    ? [
        {
          filename: attachmentName || 'monthly-report.pdf',
          path: attachmentPath,
          contentType: 'application/pdf',
        },
      ]
    : [];

  return getTransporter().sendMail({
    from: getFromAddress(),
    replyTo,
    to,
    cc: cc || undefined,
    subject,
    html,
    attachments,
  });
}

async function sendGmailOAuthEmail({
  fromEmail,
  accessToken,
  to,
  cc,
  subject,
  html,
  attachmentPath,
  attachmentName,
}) {
  const attachments = attachmentPath
    ? [
        {
          filename: attachmentName || 'monthly-report.pdf',
          path: attachmentPath,
          contentType: 'application/pdf',
        },
      ]
    : [];

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: fromEmail,
      accessToken,
    },
  });

  return transporter.sendMail({
    from: fromEmail,
    to,
    cc: cc || undefined,
    subject,
    html,
    attachments,
  });
}

module.exports = {
  sendReportEmail,
  sendGmailOAuthEmail,
};
