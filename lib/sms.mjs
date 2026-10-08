export class SmsUnavailableError extends Error {
  constructor() { super('Phone verification is temporarily unavailable. Contact your organizer.'); }
}
export function smsConfiguration(env = process.env) {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID;
  if (!/^AC[a-f0-9]{32}$/i.test(accountSid || '') || !authToken || !/^VA[a-f0-9]{32}$/i.test(serviceSid || '')) {
    throw new SmsUnavailableError();
  }
  return { accountSid, authToken, serviceSid };
}
export function createSmsVerifier(config, fetchRequest = fetch) {
  const base = `https://verify.twilio.com/v2/Services/${config.serviceSid}`;
  async function post(path, values) {
    try {
      return await fetchRequest(`${base}/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(values),
        signal: AbortSignal.timeout(10000),
        cache: 'no-store'
      });
    } catch { throw new SmsUnavailableError(); }
  }
  return {
    async send(phoneNumber) {
      if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) throw new SmsUnavailableError();
      const response = await post('Verifications', { To: phoneNumber, Channel: 'sms' });
      if (!response.ok) throw new SmsUnavailableError();
      const data = await response.json().catch(() => null);
      if (data?.status !== 'pending' || !/^VE[a-f0-9]{32}$/i.test(data?.sid || '')) throw new SmsUnavailableError();
      return data.sid;
    },
    async check(verificationSid, code) {
      if (!/^VE[a-f0-9]{32}$/i.test(verificationSid) || !/^\d{6}$/.test(code)) return false;
      const response = await post('VerificationCheck', { VerificationSid: verificationSid, Code: code });
      // Twilio deletes completed/expired verifications and returns 404.
      if ([400, 404, 429].includes(response.status)) return false;
      if (!response.ok) throw new SmsUnavailableError();
      const data = await response.json().catch(() => null);
      return data?.status === 'approved' && data?.sid === verificationSid;
    }
  };
}
