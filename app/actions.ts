'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '../lib/db';
import { requireUser, sessionCookie, tokenHash } from '../lib/auth';
import { createSmsVerifier, smsConfiguration, SmsUnavailableError } from '../lib/sms.mjs';
import { requestPhoneLogin, verifyPhoneLogin, challengeCookie, LoginChallengeError } from '../lib/phone-login.mjs';
import { detectScanType, MAX_SCAN_BYTES } from '../lib/scan.mjs';
import { encryptSessionCookie, decryptSessionCookie, sessionEncryptionKey, SESSION_LIFETIME_SECONDS } from '../lib/session-cookie.mjs';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const uuid = z.uuid();
function fail(message: string, path = '/'): never { redirect(`${path}?error=${encodeURIComponent(message)}`); }

export async function requestLoginCode(form: FormData) {
  let token: string;
  try {
    const verifier = createSmsVerifier(smsConfiguration());
    token = await requestPhoneLogin(db, text(form, 'username').toLowerCase(), verifier);
  } catch (error) {
    if (error instanceof SmsUnavailableError || error instanceof LoginChallengeError) fail(error.message, '/login');
    throw error;
  }
  (await cookies()).set(challengeCookie, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 300 });
  redirect('/login/verify');
}

export async function verifyLoginCode(form: FormData) {
  const jar = await cookies();
  let token: string;
  try {
    // Check configuration before consuming the one-time verification challenge.
    sessionEncryptionKey();
    const verifier = createSmsVerifier(smsConfiguration());
    const priorSession = await decryptSessionCookie(jar.get(sessionCookie)?.value);
    token = await verifyPhoneLogin(db, jar.get(challengeCookie)?.value || '', text(form, 'code'), verifier, priorSession ?? undefined);
  } catch (error) {
    if (error instanceof SmsUnavailableError || error instanceof LoginChallengeError) fail(error.message, '/login/verify');
    throw error;
  }
  jar.delete(challengeCookie);
  jar.set(sessionCookie, await encryptSessionCookie(token), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
    maxAge: SESSION_LIFETIME_SECONDS, expires: new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000)
  });
  redirect('/');
}

export async function logout() {
  const jar = await cookies();
  const token = await decryptSessionCookie(jar.get(sessionCookie)?.value);
  if (token) await db.query('DELETE FROM tbl_session WHERE token_hash = $1', [tokenHash(token)]);
  const challenge = jar.get(challengeCookie)?.value;
  if (challenge) await db.query('DELETE FROM tbl_login_challenge WHERE token_hash=$1', [tokenHash(challenge)]);
  jar.delete(challengeCookie);
  jar.delete(sessionCookie);
  redirect('/login');
}

export async function createBoard(form: FormData) {
  const user = await requireUser();
  const name = text(form, 'name'), edition = text(form, 'edition');
  if (!name || name.length > 100 || !edition || edition.length > 100) fail('Enter a board name and game edition (up to 100 characters).');
  const client = await db.connect();
  let id: string;
  try {
    await client.query('BEGIN');
    const board = await client.query(`INSERT INTO "tbl_gameBoard" (name, game_edition, created_by) VALUES ($1, $2, $3) RETURNING "ID"`, [name, edition, user.ID]);
    id = board.rows[0].ID;
    await client.query(`INSERT INTO "tbljn_users_gameBoard" (user_id, game_board_id, role) VALUES ($1, $2, 'owner')`, [user.ID, id]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  redirect(`/boards/${id}`);
}

export async function addMember(form: FormData) {
  const user = await requireUser();
  const boardId = uuid.parse(text(form, 'boardId'));
  const path = `/boards/${boardId}`;
  const email = text(form, 'email').toLowerCase();
  if (!z.email().safeParse(email).success) fail('Enter a valid email.', path);
  const owner = await db.query(`SELECT 1 FROM "tbljn_users_gameBoard" WHERE user_id=$1 AND game_board_id=$2 AND role='owner'`, [user.ID, boardId]);
  if (!owner.rowCount) fail('Only the board owner can add members.', path);
  const result = await db.query(`INSERT INTO "tbljn_users_gameBoard" (user_id, game_board_id)
    SELECT "ID", $2 FROM tbl_user WHERE email=$1 AND is_authorized
    ON CONFLICT DO NOTHING RETURNING user_id`, [email, boardId]);
  if (!result.rowCount) fail('No member added. Check that the account is authorized and not already on this board.', path);
  revalidatePath(path);
}

export async function addTicket(form: FormData) {
  const user = await requireUser();
  const boardId = uuid.parse(text(form, 'boardId'));
  const path = `/boards/${boardId}`;
  const membership = await db.query(`SELECT b.game_edition FROM "tbl_gameBoard" b JOIN "tbljn_users_gameBoard" m
    ON m.game_board_id=b."ID" WHERE m.user_id=$1 AND b."ID"=$2`, [user.ID, boardId]);
  if (!membership.rowCount) fail('You do not have access to this board.');
  const parsed = z.object({ name: z.string().min(1).max(100), number: z.string().min(1).max(30), code: z.string().min(1).max(100) })
    .safeParse({ name: text(form, 'name'), number: text(form, 'number'), code: text(form, 'code').toUpperCase() });
  if (!parsed.success) fail('Enter a sticker name, number, and code within the field limits.', path);
  const scan = form.get('scan');
  let data: Buffer | null = null, mime: string | null = null;
  if (scan instanceof File && scan.size) {
    if (scan.size > MAX_SCAN_BYTES) fail('Photos must be no larger than 5 MB.', path);
    data = Buffer.from(await scan.arrayBuffer());
    mime = detectScanType(data);
    if (!mime) fail('Upload a JPEG, PNG, or WebP photo.', path);
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const square = await client.query('SELECT "ID" FROM tblkp_square WHERE game_edition=$1 AND number=$2', [membership.rows[0].game_edition, parsed.data.number]);
    const ticket = await client.query(`INSERT INTO tbl_ticket (name, number, code, game_board_id, game_edition, square_id, submitted_by, scan_data, scan_mime_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING "ID"`, [parsed.data.name, parsed.data.number, parsed.data.code, boardId, membership.rows[0].game_edition, square.rows[0]?.ID ?? null, user.ID, data, mime]);
    await client.query('INSERT INTO tbljn_ticket_user (ticket_id, user_id, game_board_id) VALUES ($1,$2,$3)', [ticket.rows[0].ID, user.ID, boardId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as {code?: string}).code === '23505') fail('That sticker code is already on this board.', path);
    throw error;
  } finally { client.release(); }
  revalidatePath(path);
}

export async function setTicketStatus(form: FormData) {
  const user = await requireUser();
  const ticketId = uuid.parse(text(form, 'ticketId'));
  const boardId = uuid.parse(text(form, 'boardId'));
  const status = z.enum(['available', 'redeemed']).parse(text(form, 'status'));
  // The submitter or the board owner can update redemption state.
  const result = await db.query(`UPDATE tbl_ticket t SET status=$1 FROM "tbljn_users_gameBoard" m
    WHERE t."ID"=$2 AND t.game_board_id=$3 AND m.game_board_id=t.game_board_id AND m.user_id=$4
    AND (t.submitted_by=$4 OR m.role='owner') RETURNING t."ID"`, [status, ticketId, boardId, user.ID]);
  if (!result.rowCount) fail('You cannot update this sticker.', `/boards/${boardId}`);
  revalidatePath(`/boards/${boardId}`);
}
