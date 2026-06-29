const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/test', (req, res) => {
  res.json({ ok: true, route: 'payments route working' });
});

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
      pro: billingCycle === 'yearly' ? 9990 : 999,
      agency: billingCycle === 'yearly' ? 25000 : 2500,
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
       WHERE provider_order_id = $1
       AND agency_id = $2`,
      [razorpay_order_id, req.user.agency_id]
    );

    const order = orderResult.rows[0];

    if (!order) {
      return res.status(404).json({
        error: 'Payment order not found',
      });
    }

    if (order.status === 'paid') {
      return res.status(409).json({
        error: 'Payment already verified',
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
         billing_cycle,
         amount,
         currency,
         status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        req.user.agency_id,
        order.id,
        'razorpay',
        razorpay_payment_id,
        razorpay_order_id,
        order.plan_name,
        order.billing_cycle || 'monthly',
        order.amount,
        'INR',
        'success',
      ]
    );

    const payment = paymentResult.rows[0];

const expiresAt = new Date();

if ((order.billing_cycle || 'monthly') === 'yearly'){
  expiresAt.setDate(expiresAt.getDate() + 365);
} else {
  expiresAt.setDate(expiresAt.getDate() + 30);
}

    // Update subscription
    await db.query(
      `UPDATE subscriptions
       SET
         plan_name = $1,
         billing_cycle = $2,
         payment_provider = 'razorpay',
         last_payment_id = $3,
        status = 'active',
        started_at = CURRENT_TIMESTAMP,
        expires_at = $5,
        updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = $4`,
      [
        order.plan_name,
        order.billing_cycle || 'monthly',
        payment.id,
        req.user.agency_id,
        expiresAt,
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

// Get billing history
router.get('/history', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         id,
         provider,
         provider_payment_id,
         provider_order_id,
         plan_name,
         billing_cycle,
         amount,
         currency,
         status,
         paid_at,
         created_at
       FROM payments
       WHERE agency_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.agency_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Billing history error:', error);
    res.status(500).json({ error: 'Failed to fetch billing history' });
  }
});

// Generate payment receipt PDF
router.get('/receipt/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;

    const result = await db.query(
      `SELECT p.*, a.name AS agency_name
       FROM payments p
       LEFT JOIN agencies a ON p.agency_id = a.id
       WHERE p.id = $1 AND p.agency_id = $2`,
      [paymentId, req.user.agency_id]
    );

    const payment = result.rows[0];

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const receiptsDir = path.join(__dirname, '../../data/receipts');
    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true });
    }

    const fileName = `receipt-${payment.id}.pdf`;
    const filePath = path.join(receiptsDir, fileName);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .fillColor('#0F172A')
      .text('Payment Receipt', 50, 60);

    doc
      .fontSize(10)
      .fillColor('#64748B')
      .text(`Generated on ${new Date().toLocaleDateString()}`, 50, 92);

    doc.moveTo(50, 120).lineTo(545, 120).stroke('#2563EB');

    doc
      .fontSize(14)
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .text('Billing Details', 50, 150);

    const rows = [
      ['Agency', payment.agency_name || 'Agency'],
     [
       'Plan',
       `${payment.plan_name?.toUpperCase()} Plan (${payment.billing_cycle || 'monthly'})`,
     ],
      ['Provider', payment.provider],
      ['Payment ID', payment.provider_payment_id || '-'],
      ['Order ID', payment.provider_order_id || '-'],
      [
        'Amount',
        `₹${Number(payment.amount || 0).toLocaleString('en-IN')}`,
      ],
      ['Status', payment.status],
      ['Paid At', payment.paid_at ? new Date(payment.paid_at).toLocaleString() : '-'],
    ];

    let y = 190;

    rows.forEach(([label, value]) => {
      doc
        .fillColor('#64748B')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(label, 50, y, { width: 130 });

      doc
        .fillColor('#0F172A')
        .fontSize(10)
        .font('Helvetica')
        .text(String(value), 190, y, { width: 340 });

      y += 28;
    });

    doc
      .fontSize(9)
      .fillColor('#94A3B8')
      .text('This is a system generated receipt.', 50, 760, {
        width: 500,
        align: 'center',
      });

    doc.end();

    stream.on('finish', () => {
      const BASE_URL = 'https://marketing-report-generator-p9wj.onrender.com';
      res.json({
        url: `${BASE_URL}/data/receipts/${fileName}`,
      });
    });

    stream.on('error', (error) => {
      console.error('Receipt PDF error:', error);
      res.status(500).json({ error: 'Failed to generate receipt' });
    });
  } catch (error) {
    console.error('Receipt route error:', error);
    res.status(500).json({ error: 'Failed to generate receipt' });
  }
});
module.exports = router;