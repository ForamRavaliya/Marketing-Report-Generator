const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');

const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create payment order
router.post('/create-order', async (req, res) => {
  try {
    const { planName, billingCycle = 'monthly' } = req.body;

    const pricing = {
      free: 0,
      pro: billingCycle === 'yearly' ? 4999 : 499,
      agency: billingCycle === 'yearly' ? 9999 : 999,
    };

    if (!pricing.hasOwnProperty(planName)) {
      return res.status(400).json({
        error: 'Invalid plan selected',
      });
    }

    const amount = pricing[planName];

    if (amount <= 0) {
      return res.status(400).json({
        error: 'Free plan does not require payment',
      });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100,
      currency: 'INR',
      receipt: `agency_${req.user.agency_id}_${Date.now()}`,
    });

    const orderResult = await db.query(
      `INSERT INTO payment_orders
       (
         agency_id,
         plan_name,
         billing_cycle,
         provider,
         provider_order_id,
         amount,
         currency,
         status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        req.user.agency_id,
        planName,
        billingCycle,
        'razorpay',
        razorpayOrder.id,
        amount,
        'INR',
        'created',
      ]
    );

    res.json({
      success: true,
      order: razorpayOrder,
      dbOrder: orderResult.rows[0],
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Create order error:', error);

    res.status(500).json({
      error: 'Failed to create payment order',
    });
  }
});

// Verify payment
router.post('/verify', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planName,
      billingCycle,
    } = req.body;

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        error: 'Invalid payment signature',
      });
    }

    const orderResult = await db.query(
      `SELECT *
       FROM payment_orders
       WHERE provider_order_id = $1`,
      [razorpay_order_id]
    );

    const order = orderResult.rows[0];

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
      });
    }

    // Save payment
    const paymentResult = await db.query(
      `INSERT INTO payments
       (
         agency_id,
         order_id,
         provider,
         provider_payment_id,
         provider_order_id,
         plan_name,
         amount,
         currency,
         status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        req.user.agency_id,
        order.id,
        'razorpay',
        razorpay_payment_id,
        razorpay_order_id,
        planName,
        order.amount,
        'INR',
        'success',
      ]
    );

    const payment = paymentResult.rows[0];

    // Update subscription
    await db.query(
      `UPDATE subscriptions
       SET
         plan_name = $1,
         billing_cycle = $2,
         payment_provider = 'razorpay',
         last_payment_id = $3,
         status = 'active',
         updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = $4`,
      [
        planName,
        billingCycle,
        payment.id,
        req.user.agency_id,
      ]
    );

    // Update order status
    await db.query(
      `UPDATE payment_orders
       SET status = 'paid',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [order.id]
    );

    res.json({
      success: true,
      message: 'Payment verified successfully',
    });
  } catch (error) {
    console.error('Verify payment error:', error);

    res.status(500).json({
      error: 'Payment verification failed',
    });
  }
});

module.exports = router;