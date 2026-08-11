const express = require('express');
const crypto = require('crypto');
const { safeCompare } = require('../utils/safeCompare');
const {
  activatePaidOrder,
  markOrderFailed,
} = require('../services/paymentReconciliationService');

const router = express.Router();

router.post(
  '/razorpay',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const signature = req.headers['x-razorpay-signature'];

      // Signature must be computed over the untouched raw body — req.body
      // here is still the raw Buffer from express.raw(), not JSON-parsed.
      const expectedSignature = crypto
        .createHmac(
          'sha256',
          process.env.RAZORPAY_WEBHOOK_SECRET
        )
        .update(req.body)
        .digest('hex');

      if (!signature || !safeCompare(expectedSignature, signature)) {
        return res.status(400).json({
          error: 'Invalid webhook signature',
        });
      }

      const event = JSON.parse(req.body.toString());

      if (event.event === 'payment.captured') {
        // Reconciliation path: if the browser closed or /verify never
        // reached the backend, this webhook is what actually activates the
        // subscription. activatePaidOrder() locks the same order row that
        // /verify uses, so whichever of the two runs first "wins" and the
        // other becomes a safe no-op.
        const payment = event.payload.payment.entity;

        const result = await activatePaidOrder(payment.order_id, {
          paymentId: payment.id,
          amountPaise: Number(payment.amount),
        });

        if (!result.ok) {
          console.error(
            `Razorpay webhook: could not reconcile payment ${payment.id} for order ${payment.order_id} (${result.reason})`
          );
        } else if (result.alreadyProcessed) {
          console.log(
            `Razorpay webhook: order ${payment.order_id} already reconciled, no action needed`
          );
        } else {
          console.log(
            `✅ Razorpay webhook reconciled payment ${payment.id} for order ${payment.order_id}`
          );
        }
      } else if (event.event === 'payment.failed') {
        // Informational only — never touches subscriptions, so a failed
        // retry can never downgrade or corrupt an already-active plan.
        const payment = event.payload.payment.entity;

        await markOrderFailed(payment.order_id).catch((err) => {
          console.error(
            `Razorpay webhook: failed to mark order ${payment.order_id} as failed -`,
            err.message
          );
        });
      } else {
        console.log(
          `Razorpay webhook: received unhandled event "${event.event}", no action taken`
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