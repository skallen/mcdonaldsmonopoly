import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../lib/password.mjs';
import { detectScanType, MAX_SCAN_BYTES } from '../lib/scan.mjs';
test('password hashes are salted and reject incorrect or malformed credentials', async () => {
  const password = 'a long private password';
  const hash = await hashPassword(password);
  assert.notEqual(hash, await hashPassword(password));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('incorrect', hash), false);
  assert.equal(await verifyPassword(password, null), false);
  assert.equal(await verifyPassword(password, 'scrypt:bad:bad'), false);
});
test('scan validation rejects unsupported and oversized content', () => {
  assert.equal(detectScanType(Buffer.from('<svg onload="alert(1)"></svg>')), null);
  assert.equal(detectScanType(Buffer.alloc(0)), null);
  assert.equal(detectScanType(Buffer.alloc(MAX_SCAN_BYTES + 1)), null);
  assert.equal(detectScanType(Buffer.from([0xff, 0xd8, 0xff])), 'image/jpeg');
  assert.equal(detectScanType(Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(detectScanType(Buffer.from('RIFF0000WEBP')), 'image/webp');
});
