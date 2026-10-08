import { randomBytes, createHash } from 'node:crypto';
export const challengeCookie = 'kallen_phone_challenge';
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const validUsername = username => /^[a-z0-9][a-z0-9._-]{2,39}$/.test(username);
export class LoginChallengeError extends Error {}

export async function requestPhoneLogin(pool, username, verifier) {
  if (!validUsername(username)) throw new LoginChallengeError('Enter a valid username (3–40 letters, numbers, dots, underscores, or hyphens).');
  const limit = await pool.query(`INSERT INTO tbl_login_rate_limit (username) VALUES ($1)
    ON CONFLICT (username) DO UPDATE SET
      sends=CASE WHEN tbl_login_rate_limit.window_start < now()-interval '15 minutes' THEN 1 ELSE tbl_login_rate_limit.sends+1 END,
      window_start=CASE WHEN tbl_login_rate_limit.window_start < now()-interval '15 minutes' THEN now() ELSE tbl_login_rate_limit.window_start END,
      next_send_at=now()+interval '60 seconds'
    WHERE tbl_login_rate_limit.next_send_at <= now()
      AND (tbl_login_rate_limit.sends < 3 OR tbl_login_rate_limit.window_start < now()-interval '15 minutes')
    RETURNING username`, [username]);
  if (!limit.rowCount) throw new LoginChallengeError('Please wait before requesting another code. You can request up to three in 15 minutes.');
  const result = await pool.query(`SELECT "ID", phone_number FROM tbl_user WHERE username=$1 AND is_authorized`, [username]);
  const user = result.rows[0];
  const canSend = user && /^\+[1-9]\d{7,14}$/.test(user.phone_number || '');
  const token = randomBytes(32).toString('hex');
  const sid = canSend ? await verifier.send(user.phone_number) : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize challenge replacement for this account.
    if (canSend) {
      await client.query('SELECT "ID" FROM tbl_user WHERE "ID"=$1 FOR UPDATE', [user.ID]);
      await client.query('DELETE FROM tbl_login_challenge WHERE user_id=$1', [user.ID]);
    }
    await client.query('DELETE FROM tbl_login_challenge WHERE expires_at <= now()');
    await client.query(`INSERT INTO tbl_login_challenge (token_hash, user_id, phone_number, verification_sid, expires_at)
      VALUES ($1,$2,$3,$4,now()+interval '5 minutes')`, [hashToken(token), canSend ? user.ID : null, canSend ? user.phone_number : null, sid]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  return token;
}

export async function verifyPhoneLogin(pool, token, code, verifier, priorSession) {
  if (!/^[a-f0-9]{64}$/.test(token || '') || !/^\d{6}$/.test(code)) throw new LoginChallengeError('Enter the six-digit code sent to your phone.');
  // Claim one attempt atomically. This counter commits even for invalid codes.
  const attempt = await pool.query(`UPDATE tbl_login_challenge SET attempts=attempts+1
    WHERE token_hash=$1 AND expires_at>now() AND attempts<5 RETURNING token_hash`, [hashToken(token)]);
  if (!attempt.rowCount) throw new LoginChallengeError('This code has expired or has too many attempts. Request a new code.');
  const client = await pool.connect();
  let sessionToken;
  let approved = false;
  try {
    await client.query('BEGIN');
    // A locked challenge can be consumed only once, even under concurrent checks.
    const result = await client.query(`SELECT c.*, u.is_authorized, u.phone_number AS recorded_phone
      FROM tbl_login_challenge c LEFT JOIN tbl_user u ON u."ID"=c.user_id
      WHERE c.token_hash=$1 AND c.expires_at>now() FOR UPDATE OF c`, [hashToken(token)]);
    const challenge = result.rows[0];
    if (challenge?.user_id && challenge.is_authorized && challenge.phone_number === challenge.recorded_phone) {
      approved = await verifier.check(challenge.verification_sid, code);
    }
    if (approved) {
      // Recheck authorization after the provider roundtrip before issuing a session.
      const authorized = await client.query(`SELECT u."ID" FROM tbl_user u
        JOIN tbl_login_challenge c ON c.user_id=u."ID"
        WHERE u."ID"=$1 AND u.is_authorized AND u.phone_number=$2
          AND c.token_hash=$3 AND c.expires_at>clock_timestamp() FOR SHARE OF u`, [challenge.user_id, challenge.phone_number, hashToken(token)]);
      approved = authorized.rowCount === 1;
    }
    if (approved) {
      sessionToken = randomBytes(32).toString('hex');
      await client.query('DELETE FROM tbl_login_challenge WHERE user_id=$1', [challenge.user_id]);
      if (priorSession) await client.query('DELETE FROM tbl_session WHERE token_hash=$1', [hashToken(priorSession)]);
      await client.query('DELETE FROM tbl_session WHERE expires_at<=now()');
      await client.query(`INSERT INTO tbl_session (token_hash, user_id, verified_phone_number, expires_at)
        VALUES ($1,$2,$3,now()+interval '7 days')`, [hashToken(sessionToken), challenge.user_id, challenge.phone_number]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  if (!sessionToken) throw new LoginChallengeError('The code is incorrect or unavailable. Check it and try again.');
  return sessionToken;
}
