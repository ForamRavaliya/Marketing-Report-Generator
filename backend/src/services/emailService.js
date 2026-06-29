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
}) {
  return transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
    to,
    cc,
    subject,
    html,
    attachments: attachmentPath
      ? [
          {
            filename: attachmentName,
            path: attachmentPath,
          },
        ]
      : [],
  });
}

module.exports = {
  sendReportEmail,
};