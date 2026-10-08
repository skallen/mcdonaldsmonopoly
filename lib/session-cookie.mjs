import { EncryptJWT, jwtDecrypt } from 'jose';
export const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const issuer = 'kallen-monopoly-pooling';
const audience = 'browser-session';

export function sessionEncryptionKey(env = process.env) {
  const encoded = env.SESSION_COOKIE_KEY;
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded || '')) {
    throw new Error('Set SESSION_COOKIE_KEY to a 32-byte base64url key. Run npm run session:key.');
  }
  const key = Buffer.from(encoded, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== encoded) throw new Error('SESSION_COOKIE_KEY must contain exactly 32 random bytes.');
  return key;
}

export async function encryptSessionCookie(token, key = sessionEncryptionKey(), now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid session token.');
  const issuedAt = Math.floor(now / 1000);
  return new EncryptJWT({ token })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' })
    .setIssuer(issuer).setAudience(audience).setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_LIFETIME_SECONDS)
    .encrypt(key);
}

export async function decryptSessionCookie(value, key = undefined, now = Date.now()) {
  if (!value || value.length > 1024) return null;
  try {
    const { payload } = await jwtDecrypt(value, key ?? sessionEncryptionKey(), {
      issuer, audience, currentDate: new Date(now), maxTokenAge: '7d',
      keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM']
    });
    if (typeof payload.token !== 'string' || !/^[a-f0-9]{64}$/.test(payload.token)
      || typeof payload.iat !== 'number' || typeof payload.exp !== 'number'
      || payload.exp - payload.iat !== SESSION_LIFETIME_SECONDS) return null;
    return payload.token;
  } catch { return null; }
}
