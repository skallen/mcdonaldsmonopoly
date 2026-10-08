import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { requestPhoneLogin, verifyPhoneLogin, hashToken, LoginChallengeError } from '../lib/phone-login.mjs';

test('phone login enforces saved numbers, expiry, attempt limits, authorization, and one-time consumption', {skip: !process.env.INTEGRATION_DATABASE_URL}, async () => {
  const pool = new pg.Pool({connectionString: process.env.INTEGRATION_DATABASE_URL});
  const username = 'otp_'+randomBytes(12).toString('hex');
  const unknown = 'unknown_'+randomBytes(12).toString('hex');
  const sent = [];
  const sid = 'VE'+randomBytes(16).toString('hex');
  const verifier = { send: async phone => { sent.push(phone); return sid; }, check: async (verification,code) => verification===sid && code==='654321' };
  let userId;
  async function nextChallenge() {
    await pool.query('DELETE FROM tbl_login_rate_limit WHERE username=$1',[username]);
    return requestPhoneLogin(pool,username,verifier);
  }
  try {
    const user = await pool.query(`INSERT INTO tbl_user (username,"firstName","lastName",email,phone_number,is_authorized)
      VALUES ($1,'OTP','Test',$2,'+15005550006',true) RETURNING "ID"`, [username,`${username}@example.com`]);
    userId = user.rows[0].ID;
    const challenge = await requestPhoneLogin(pool,username,verifier);
    assert.deepEqual(sent,['+15005550006']);
    assert.equal((await pool.query('SELECT * FROM tbl_session WHERE user_id=$1',[userId])).rowCount,0);
    await assert.rejects(requestPhoneLogin(pool,username,verifier),LoginChallengeError);
    await assert.rejects(verifyPhoneLogin(pool,challenge,'111111',verifier),LoginChallengeError);
    assert.equal((await pool.query('SELECT attempts FROM tbl_login_challenge WHERE token_hash=$1',[hashToken(challenge)])).rows[0].attempts,1);
    const session = await verifyPhoneLogin(pool,challenge,'654321',verifier);
    assert.equal((await pool.query('SELECT * FROM tbl_session WHERE token_hash=$1',[hashToken(session)])).rowCount,1);
    await assert.rejects(verifyPhoneLogin(pool,challenge,'654321',verifier),LoginChallengeError);
    const expired = await nextChallenge();
    await pool.query('UPDATE tbl_login_challenge SET expires_at=now()-interval \'1 second\' WHERE token_hash=$1',[hashToken(expired)]);
    await assert.rejects(verifyPhoneLogin(pool,expired,'654321',verifier),LoginChallengeError);
    const limited = await nextChallenge();
    for(let i=0;i<5;i++) await assert.rejects(verifyPhoneLogin(pool,limited,'111111',verifier),LoginChallengeError);
    await assert.rejects(verifyPhoneLogin(pool,limited,'654321',verifier),LoginChallengeError);
    const changedPhone = await nextChallenge();
    await pool.query('UPDATE tbl_user SET phone_number=$1 WHERE "ID"=$2',['+15005550007',userId]);
    await assert.rejects(verifyPhoneLogin(pool,changedPhone,'654321',verifier),LoginChallengeError);
    const revoked = await nextChallenge();
    await pool.query('UPDATE tbl_user SET is_authorized=false WHERE "ID"=$1',[userId]);
    await assert.rejects(verifyPhoneLogin(pool,revoked,'654321',verifier),LoginChallengeError);
    const sendCount = sent.length;
    const missingUser = await requestPhoneLogin(pool,unknown,verifier);
    assert.equal(sent.length,sendCount);
    await assert.rejects(verifyPhoneLogin(pool,missingUser,'654321',verifier),LoginChallengeError);
    await pool.query('DELETE FROM tbl_login_challenge WHERE token_hash=$1',[hashToken(missingUser)]);
    await pool.query('UPDATE tbl_user SET is_authorized=true WHERE "ID"=$1',[userId]);
    const concurrent = await nextChallenge();
    const results = await Promise.allSettled([verifyPhoneLogin(pool,concurrent,'654321',verifier),verifyPhoneLogin(pool,concurrent,'654321',verifier)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  } finally {
    if(userId) await pool.query('DELETE FROM tbl_user WHERE "ID"=$1',[userId]);
    await pool.query('DELETE FROM tbl_login_rate_limit WHERE username=ANY($1::text[])',[[username,unknown]]);
    await pool.end();
  }
});
