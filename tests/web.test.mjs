import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
import { requestPhoneLogin, verifyPhoneLogin } from '../lib/phone-login.mjs';
import { encryptSessionCookie, decryptSessionCookie } from '../lib/session-cookie.mjs';

const url = process.env.INTEGRATION_BASE_URL;
const connectionString = process.env.INTEGRATION_DATABASE_URL;
test('private boards, sticker uploads, board rendering, and phone-bound sessions', { skip: !url || !connectionString }, async () => {
  const db = new pg.Pool({ connectionString });
  const suffix = randomUUID();
  const edition = `TEST-${suffix}`;
  const users = [];
  const request = (path, cookie, options = {}) => fetch(new URL(path, url), {
    redirect: 'manual', ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers }
  });
  const html = async (path, cookie) => {
    const response = await request(path, cookie);
    assert.equal(response.status, 200);
    return response.text();
  };
  async function submit(page, field, path, values, cookie, origin = url) {
    const form = [...page.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].find(match => match[1].includes(`name="${field}"`))?.[1];
    assert.ok(form, `Missing form containing ${field}`);
    const body = new FormData();
    for (const match of form.matchAll(/<input\b[^>]*>/g)) {
      const name = /name="([^"]*)"/.exec(match[0])?.[1];
      if (name && (name.startsWith('$ACTION_') || match[0].includes('type="hidden"'))) {
        body.set(name, /value="([^"]*)"/.exec(match[0])?.[1] ?? '');
      }
    }
    for (const [key, value] of Object.entries(values)) body.set(key, value);
    return request(path, cookie, { method: 'POST', body, headers: { Origin: origin } });
  }
  async function signIn(user) {
    const sid = 'VE'+randomBytes(16).toString('hex');
    const verifier = { send: async () => sid, check: async (id,code) => id===sid && code==='654321' };
    const challenge = await requestPhoneLogin(db,user.username,verifier);
    const token = await verifyPhoneLogin(db,challenge,'654321',verifier);
    return `monopoly_session=${await encryptSessionCookie(token)}`;
  }
  try {
    for (const firstName of ['Owner', 'Member', 'Outsider']) {
      const username = firstName.toLowerCase()+'_'+randomBytes(12).toString('hex');
      const result = await db.query(`INSERT INTO tbl_user (username, "firstName", "lastName", email, phone_number, is_authorized)
        VALUES ($1, $2, 'Integration', $3, '+15005550006', true) RETURNING "ID", email, username`, [username, firstName, `${firstName.toLowerCase()}-${suffix}@example.com`]);
      users.push(result.rows[0]);
    }
    const [owner, member, outsider] = users;
    await db.query(`INSERT INTO tblkp_square (name, number, game_edition, color) VALUES ('Test square', '101', $1, 'Blue')`, [edition]);
    assert.equal((await request('/')).headers.get('location'), '/login');
    assert.equal((await request(`/api/tickets/${randomUUID()}/scan`)).status, 401);
    const loginPage = await html('/login');
    assert.match(loginPage,/name="username"/);
    assert.ok(!loginPage.includes('name="password"'));
    assert.equal((await request('/login/verify')).headers.get('location'),'/login');
    const ownerCookie = await signIn(owner);
    assert.equal((await request('/login',ownerCookie)).headers.get('location'),'/');
    assert.equal((await request('/login/verify',ownerCookie)).headers.get('location'),'/');
    const rawToken=await decryptSessionCookie(ownerCookie.split('=')[1]);
    assert.equal((await request('/',`monopoly_session=${rawToken}`)).headers.get('location'),'/login');
    const homepage = await html('/',ownerCookie);
    assert.match(homepage, /Kallen Monopoly Pooling/);
    assert.match(homepage, /monopoly-board/);
    assert.match(homepage, /name="logout"/);
    assert.equal((homepage.match(/class="monopoly-space /g)||[]).length,40);
    const outsiderCookie = await signIn(outsider);
    const created = await submit(await html('/', ownerCookie), 'edition', '/', { name: 'Integration board', edition }, ownerCookie);
    assert.equal(created.status, 303);
    const path = created.headers.get('location');
    assert.match(path, /^\/boards\/[a-f0-9-]+$/);
    let page = await html(path, ownerCookie);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
    const ticketValues = { name: 'Test square', number: '101', code: 'test-code', scan: new File([png], 'sticker.png', { type: 'image/png' }) };
    const added = await submit(page, 'scan', path, ticketValues, ownerCookie);
    assert.ok(added.status < 400);
    const tickets = await db.query('SELECT * FROM tbl_ticket WHERE game_edition=$1', [edition]);
    assert.equal(tickets.rowCount, 1);
    const ticket = tickets.rows[0];
    assert.ok(ticket.square_id);
    assert.equal(ticket.code, 'TEST-CODE');
    assert.equal((await db.query('SELECT * FROM tbljn_ticket_user WHERE ticket_id=$1', [ticket.ID])).rowCount, 1);
    page = await html(path, ownerCookie);
    assert.match(page, /TEST-CODE/);
    const scanPath = `/api/tickets/${ticket.ID}/scan`;
    const scan = await request(scanPath, ownerCookie);
    assert.equal(scan.status, 200);
    assert.equal(scan.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await scan.arrayBuffer()), png);
    assert.equal((await request(scanPath, outsiderCookie)).status, 404);
    const outsiderPage = await request(path, outsiderCookie);
    const outsiderHtml = await outsiderPage.text();
    // Streaming responses may deliver a not-found boundary with HTTP 200.
    assert.ok(outsiderPage.status === 404 || outsiderHtml.includes('NEXT_HTTP_ERROR_FALLBACK;404'));
    assert.ok(!outsiderHtml.includes('TEST-CODE'));
    await submit(page, 'scan', path, { ...ticketValues, code: 'outsider-code' }, outsiderCookie);
    assert.equal((await db.query('SELECT * FROM tbl_ticket WHERE game_edition=$1', [edition])).rowCount, 1);
    const duplicate = await submit(page, 'scan', path, ticketValues, ownerCookie);
    assert.match(duplicate.headers.get('location'), /already/);
    await submit(page, 'email', path, { email: member.email }, ownerCookie);
    const memberCookie = await signIn(member);
    const memberPage = await html(path, memberCookie);
    assert.match(memberPage, /TEST-CODE/);
    assert.equal((await request(scanPath, memberCookie)).status, 200);
    await submit(page, 'ticketId', path, { status: 'redeemed' }, memberCookie);
    assert.equal((await db.query('SELECT status FROM tbl_ticket WHERE "ID"=$1', [ticket.ID])).rows[0].status, 'available');
    await submit(page, 'ticketId', path, { status: 'redeemed' }, ownerCookie);
    assert.equal((await db.query('SELECT status FROM tbl_ticket WHERE "ID"=$1', [ticket.ID])).rows[0].status, 'redeemed');
    await submit(page, 'email', path, { email: outsider.email }, memberCookie);
    assert.equal((await db.query(`SELECT 1 FROM "tbljn_users_gameBoard" WHERE user_id=$1 AND game_board_id=$2`, [outsider.ID, ticket.game_board_id])).rowCount, 0);
    await submit(page, 'scan', path, { ...ticketValues, code: 'csrf-code' }, ownerCookie, 'https://untrusted.example');
    assert.equal((await db.query('SELECT * FROM tbl_ticket WHERE game_edition=$1', [edition])).rowCount, 1);
    await db.query('UPDATE tbl_user SET is_authorized=false WHERE "ID"=$1', [owner.ID]);
    assert.equal((await request(scanPath, ownerCookie)).status, 401);
    assert.equal((await request(path, ownerCookie)).headers.get('location'), '/login');
    const account = await html('/account', memberCookie);
    assert.match(account,/Verification phone/);
    await db.query('UPDATE tbl_user SET phone_number=$1 WHERE "ID"=$2',['+15005550007',member.ID]);
    assert.equal((await request(scanPath, memberCookie)).status, 401);
    // Logout clears the browser cookie and revokes the copied encrypted cookie.
    const outsiderHome=await html('/',outsiderCookie);
    const loggedOut=await submit(outsiderHome,'logout','/',{},outsiderCookie);
    assert.equal(loggedOut.headers.get('location'),'/login');
    assert.ok(loggedOut.headers.get('set-cookie').includes('monopoly_session='));
    assert.equal((await request('/',outsiderCookie)).headers.get('location'),'/login');
  } finally {
    try {
      await db.query('DELETE FROM "tbl_gameBoard" WHERE game_edition=$1', [edition]);
      await db.query('DELETE FROM tblkp_square WHERE game_edition=$1', [edition]);
      for (const user of users) {
        await db.query('DELETE FROM tbl_login_attempt WHERE email=$1', [user.email]);
        await db.query('DELETE FROM tbl_login_rate_limit WHERE username=$1', [user.username]);
        await db.query('DELETE FROM tbl_user WHERE "ID"=$1', [user.ID]);
      }
    } finally { await db.end(); }
  }
});
