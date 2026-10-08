import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';
export const sessionCookie = 'monopoly_session';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export type User = { ID: string; firstName: string; lastName: string; username: string; email: string; phone_number: string; is_admin: boolean };
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return null;
  const result = await db.query<User>(`
    SELECT u."ID", u."firstName", u."lastName", u.username, u.email, u.phone_number, u.is_admin
    FROM tbl_session s JOIN tbl_user u ON u."ID" = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_authorized
      AND s.verified_phone_number = u.phone_number`, [tokenHash(token)]);
  return result.rows[0] ?? null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}
