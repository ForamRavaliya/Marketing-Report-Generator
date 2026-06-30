const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendReportEmail({
  to,
  cc,
  subject,
  html,
  attachmentPath,
  attachmentName,
  fromName,
  fromEmail,
  replyTo,
}) {
  const safeFromEmail = fromEmail || process.env.SMTP_FROM_EMAIL;
  const safeFromName = fromName || process.env.SMTP_FROM_NAME;

  return transporter.sendMail({
    from: `"${safeFromName}" <${safeFromEmail}>`,
    replyTo: replyTo || safeFromEmail,
    to,
    cc,
    subject,
    html,
    attachments: attachmentPath
      ? [{ filename: attachmentName, path: attachmentPath }]
      : [],
  });
}

module.exports = {
  sendReportEmail,
};