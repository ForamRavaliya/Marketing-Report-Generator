const normalize = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[_\-()%₹$,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const includesAny = (text, words = []) =>
  words.some((word) => text.includes(normalize(word)));

function detectPlatform(headers = [], fileName = '') {
  const text = [...headers, fileName].map(normalize).join(' ');

  if (
    includesAny(text, [
      'amount spent',
      'ad set',
      'facebook',
      'instagram',
      'meta',
      'messaging conversations',
    ])
  ) {
    return 'meta';
  }

  if (
    includesAny(text, [
      'google ads',
      'campaign type',
      'search impression share',
      'cost micros',
      'interactions',
      'google',
    ])
  ) {
    return 'google';
  }

  if (
    includesAny(text, [
      'linkedin',
      'company page',
      'sponsored content',
      'total engagements',
    ])
  ) {
    return 'linkedin';
  }

  if (
    includesAny(text, [
      'tiktok',
      'video views',
      'paid followers',
      'profile visits',
    ])
  ) {
    return 'tiktok';
  }

  if (
    includesAny(text, [
      'shopify',
      'order id',
      'order number',
      'sku',
      'net sales',
      'gross sales',
      'refunds',
    ])
  ) {
    return 'shopify';
  }

  if (
    includesAny(text, [
      'woocommerce',
      'billing email',
      'order status',
      'product sku',
    ])
  ) {
    return 'woocommerce';
  }

  if (
    includesAny(text, [
      'amazon',
      'asin',
      'seller sku',
      'ordered product sales',
    ])
  ) {
    return 'amazon';
  }

  if (
    includesAny(text, [
      'ga4',
      'google analytics',
      'sessions',
      'users',
      'engaged sessions',
      'event count',
    ])
  ) {
    return 'ga4';
  }

  return 'other';
}

module.exports = {
  detectPlatform,
};