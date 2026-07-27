const crypto = require('crypto');

const getKey = () => {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required for platform token encryption.');
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  return crypto.createHash('sha256').update(raw).digest();
};

const encryptToken = (token) => {
  if (!token) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
};

const decryptToken = (payload) => {
  if (!payload) return null;

  const [ivRaw, tagRaw, encryptedRaw] = String(payload).split(':');
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Encrypted token payload is invalid.');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

module.exports = {
  encryptToken,
  decryptToken,
};
