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
 const nodemailer = require('nodemailer');
 const dns = require('dns');

 dns.setDefaultResultOrder('ipv4first');

 const transporter = nodemailer.createTransport({
   host: process.env.SMTP_HOST || 'smtp.gmail.com',
   port: Number(process.env.SMTP_PORT || 587),
   secure: false,
   requireTLS: true,
   family: 4,
   auth: {
     user: process.env.SMTP_USER,
     pass: process.env.SMTP_PASS,
   },
 });
}

module.exports = {
  sendReportEmail,
};