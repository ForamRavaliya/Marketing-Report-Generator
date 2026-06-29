const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const { sendReportEmail } = require('../services/emailService');

router.use(authenticate);

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

    res.json({
      success: true,
      message: 'Email sent successfully',
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;