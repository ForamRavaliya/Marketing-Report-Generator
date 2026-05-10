const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

router.post(
  '/razorpay',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const signature = req.headers['x-razorpay-signature'];

      const expectedSignature = crypto
        .createHmac(
          'sha256',
          process.env.RAZORPAY_WEBHOOK_SECRET
        )
        .update(req.body)
        .digest('hex');

      if (signature !== expectedSignature) {
        return res.status(400).json({
          error: 'Invalid webhook signature',
        });
      }

      const event = JSON.parse(req.body.toString());

      // Payment captured
      if (event.event === 'payment.captured') {
        const payment = event.payload.payment.entity;

        await db.query(
          `UPDATE payment_orders
           SET status = 'paid',
               updated_at = CURRENT_TIMESTAMP
           WHERE provider_order_id = $1`,
          [payment.order_id]
        );

        console.log(
          `✅ Razorpay webhook captured payment ${payment.id}`
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Webhook error:', error);

      res.status(500).json({
        error: 'Webhook processing failed',
      });
    }
  }
);

module.exports = router;