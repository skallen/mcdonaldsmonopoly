import pg from 'pg';
import { validUsername } from '../lib/phone-login.mjs';
const [usernameInput, emailInput, firstName, lastName, phoneNumber] = process.argv.slice(2);
const username = usernameInput?.trim().toLowerCase();
const email = emailInput?.trim().toLowerCase();
if (!username || !validUsername(username) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !firstName?.trim() || !lastName?.trim() || !/^\+[1-9]\d{7,14}$/.test(phoneNumber || '')) {
  throw new Error('Usage: npm run user:invite -- username email firstName lastName +13125550123. Phone must be in E.164 format.');
}
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env or .env.local');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(`INSERT INTO tbl_user (username, "firstName", "lastName", phone_number, email, is_authorized)
    VALUES ($1, $2, $3, $4, $5, true)`, [username, firstName.trim(), lastName.trim(), phoneNumber, email]);
  console.log(`Authorized account created. Sign in as ${username} using the verification code sent to the recorded phone.`);
} finally { await client.end(); }
