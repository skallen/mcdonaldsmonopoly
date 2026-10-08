import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptSessionCookie, decryptSessionCookie, sessionEncryptionKey, SESSION_LIFETIME_SECONDS } from '../lib/session-cookie.mjs';
test('cookies encrypt the session identifier and use a unique nonce', async () => {
  const key = randomBytes(32), token = randomBytes(32).toString('hex');
  const value = await encryptSessionCookie(token,key);
  assert.equal(value.split('.').length,5);
  assert.ok(!value.includes(token));
  assert.notEqual(await encryptSessionCookie(token,key),value);
  assert.equal(await decryptSessionCookie(value,key),token);
});
test('encrypted cookies expire after exactly one week and cannot be forged', async () => {
  const key=randomBytes(32), token=randomBytes(32).toString('hex');
  const issuedAt=Date.UTC(2026,9,8,12);
  const value=await encryptSessionCookie(token,key,issuedAt);
  assert.equal(await decryptSessionCookie(value,key,issuedAt+(SESSION_LIFETIME_SECONDS-1)*1000),token);
  assert.equal(await decryptSessionCookie(value,key,issuedAt+SESSION_LIFETIME_SECONDS*1000),null);
  const parts=value.split('.');
  parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);
  assert.equal(await decryptSessionCookie(parts.join('.'),key,issuedAt),null);
  assert.equal(await decryptSessionCookie(value,randomBytes(32),issuedAt),null);
  assert.equal(await decryptSessionCookie(token,key,issuedAt),null);
  assert.equal(await decryptSessionCookie('invalid',key,issuedAt),null);
});
test('cookie encryption requires a properly generated server key', () => {
  assert.throws(()=>sessionEncryptionKey({}));
  assert.throws(()=>sessionEncryptionKey({SESSION_COOKIE_KEY:'short'}));
  const key=randomBytes(32);
  assert.deepEqual(sessionEncryptionKey({SESSION_COOKIE_KEY:key.toString('base64url')}),key);
});
