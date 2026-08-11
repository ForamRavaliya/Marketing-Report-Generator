const assert = require('assert');
const crypto = require('crypto');
const { safeCompare } = require('./safeCompare');

(() => {
  assert.strictEqual(safeCompare('abc123', 'abc123'), true);
})();

(() => {
  assert.strictEqual(safeCompare('abc123', 'abc124'), false);
})();

(() => {
  // Different lengths must return false, not throw.
  assert.strictEqual(safeCompare('short', 'a-much-longer-string'), false);
})();

(() => {
  assert.strictEqual(safeCompare('', ''), true);
})();

(() => {
  assert.strictEqual(safeCompare(undefined, undefined), true);
  assert.strictEqual(safeCompare(undefined, 'x'), false);
})();

(() => {
  // Realistic Razorpay-style HMAC signature verification scenario.
  const secret = 'test_webhook_secret';
  const payload = JSON.stringify({ event: 'payment.captured', payload: { id: 'pay_123' } });
  const validSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const tamperedPayload = JSON.stringify({ event: 'payment.captured', payload: { id: 'pay_999' } });
  const invalidSignature = crypto.createHmac('sha256', secret).update(tamperedPayload).digest('hex');

  assert.strictEqual(safeCompare(validSignature, validSignature), true);
  assert.strictEqual(safeCompare(validSignature, invalidSignature), false);
  assert.strictEqual(safeCompare(validSignature, 'not-even-hex-length'), false);
})();

console.log('safeCompare HMAC/signature tests passed');
