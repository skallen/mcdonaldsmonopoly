import { randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { sessionEncryptionKey } from '../lib/session-cookie.mjs';
const file = new URL('../.env.local', import.meta.url);
let contents;
try { contents = await readFile(file, 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; contents = ''; }
const existing = /^SESSION_COOKIE_KEY=(.*)$/m.exec(contents);
if (existing) {
  sessionEncryptionKey({ SESSION_COOKIE_KEY: existing[1].trim().replace(/^(['"])(.*)\1$/, '$2') });
  console.log('Existing session encryption key retained.');
} else {
  const key = randomBytes(32).toString('base64url');
  await writeFile(file, `${contents}${contents.endsWith('\n') || !contents ? '' : '\n'}SESSION_COOKIE_KEY=${key}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  console.log('Generated a session encryption key in gitignored .env.local. Keep the same key on every web server.');
}
