const db = require('../db');

const BILLING_CYCLE_DAYS = { monthly: 30, yearly: 365 };

// Activates the plan tied to a Razorpay order, from either the client-driven
// /verify call or the Razorpay webhook. Both callers pass the same
// provider_order_id, so locking that row with SELECT ... FOR UPDATE makes the
// two paths mutually exclusive without needing a new DB constraint: whichever
// call gets there first performs the writes and marks the order 'paid'; the
// other blocks on the lock, then sees status='paid' and exits as a no-op.
//
// Plan name, billing cycle and amount always come from the payment_orders row
// itself (written server-side at create-order time) — never from the caller.
const activatePaidOrder = async (
  providerOrderId,
  { paymentId, amountPaise = null } = {}
) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM payment_orders WHERE provider_order_id = $1 FOR UPDATE`,
      [providerOrderId]
    );
    const order = orderResult.rows[0];

    if (!order) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'order_not_found' };
    }

    if (order.status === 'paid') {
      await client.query('ROLLBACK');
      return { ok: true, alreadyProcessed: true, order };
    }

    if (typeof amountPaise === 'number') {
      const expectedPaise = Math.round(Number(order.amount) * 100);
      if (expectedPaise !== amountPaise) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'amount_mismatch', order };
      }
    }

    // Defense-in-depth: no unique DB constraint exists yet on
    // payments.provider_payment_id (tracked separately as a schema hardening
    // item), so also guard here against inserting a second payments row for
    // a payment_id we've already recorded.
    const existingPayment = await client.query(
      `SELECT id FROM payments WHERE provider_payment_id = $1`,
      [paymentId]
    );

    if (existingPayment.rows.length) {
      await client.query(
        `UPDATE payment_orders
         SET status = 'paid', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [order.id]
      );
      await client.query('COMMIT');
      return { ok: true, alreadyProcessed: true, order };
    }

    const billingCycle = order.billing_cycle || 'monthly';
    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + (BILLING_CYCLE_DAYS[billingCycle] || 30)
    );

    const paymentResult = await client.query(
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
         status,
         paid_at
       )
       VALUES ($1,$2,'razorpay',$3,$4,$5,$6,$7,$8,'success', CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        order.agency_id,
        order.id,
        paymentId,
        providerOrderId,
        order.plan_name,
        billingCycle,
        order.amount,
        order.currency || 'INR',
      ]
    );
    const payment = paymentResult.rows[0];

    await client.query(
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
      [order.plan_name, billingCycle, payment.id, order.agency_id, expiresAt]
    );

    await client.query(
      `UPDATE payment_orders
       SET status = 'paid', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [order.id]
    );

    await client.query('COMMIT');
    return { ok: true, alreadyProcessed: false, order, payment };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

// Marks an order failed on a verified payment.failed webhook event. Never
// touches subscriptions — a failed retry on a new order must not be able to
// downgrade or corrupt an already-active paid subscription from a prior
// successful payment.
const markOrderFailed = async (providerOrderId) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM payment_orders WHERE provider_order_id = $1 FOR UPDATE`,
      [providerOrderId]
    );
    const order = orderResult.rows[0];

    if (order && order.status === 'created') {
      await client.query(
        `UPDATE payment_orders
         SET status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [order.id]
      );
    }

    await client.query('COMMIT');
    return { ok: Boolean(order) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { activatePaidOrder, markOrderFailed };
