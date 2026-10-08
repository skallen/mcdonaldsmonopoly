import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmsVerifier, smsConfiguration, SmsUnavailableError } from '../lib/sms.mjs';
const config = { accountSid: 'AC'+'a'.repeat(32), authToken: 'test-only-secret', serviceSid: 'VA'+'b'.repeat(32) };
const sid = 'VE'+'c'.repeat(32);
test('SMS configuration fails closed without credentials', () => {
  assert.throws(() => smsConfiguration({}), SmsUnavailableError);
});
test('Twilio Verify sends only to the saved phone and checks the exact verification SID', async () => {
  const calls = [];
  const verifier = createSmsVerifier(config, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({sid, status: url.endsWith('/Verifications') ? 'pending' : 'approved'}), {status: 200});
  });
  assert.equal(await verifier.send('+13125550123'), sid);
  assert.equal(calls[0].options.body.get('To'), '+13125550123');
  assert.equal(calls[0].options.body.get('Channel'), 'sms');
  assert.equal(await verifier.check(sid, '123456'), true);
  assert.equal(calls[1].options.body.get('VerificationSid'), sid);
  assert.equal(calls[1].options.body.get('Code'), '123456');
  assert.equal(calls[1].options.body.has('To'), false);
  await assert.rejects(verifier.send('555-0100'), SmsUnavailableError);
});
test('wrong, expired, mismatched, and provider-failed verifications cannot approve login', async () => {
  for (const [status, body] of [[200,{sid,status:'pending'}],[404,{}],[429,{}],[200,{sid:'VE'+'d'.repeat(32),status:'approved'}]]) {
    const verifier = createSmsVerifier(config, async () => new Response(JSON.stringify(body), {status}));
    assert.equal(await verifier.check(sid,'123456'), false);
  }
  const failed = createSmsVerifier(config, async () => { throw new Error('network failure'); });
  await assert.rejects(failed.check(sid,'123456'), SmsUnavailableError);
});
