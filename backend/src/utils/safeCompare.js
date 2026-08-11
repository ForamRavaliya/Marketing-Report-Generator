const crypto = require('crypto');

// Constant-time string comparison for signature checks. Returns false (rather
// than throwing) when lengths differ, since crypto.timingSafeEqual requires
// equal-length buffers and an attacker-controlled input must never crash the
// request handler.
const safeCompare = (a, b) => {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
};

module.exports = { safeCompare };
