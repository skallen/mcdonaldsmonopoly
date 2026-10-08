import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyLoginCode } from '../../actions';
import { Header, Message } from '../../components';
import { challengeCookie } from '../../../lib/phone-login.mjs';
export default async function Verify({ searchParams }: { searchParams: Promise<{error?: string}> }) {
  if (!(await cookies()).get(challengeCookie)?.value) redirect('/login');
  return <><Header/><main className="simple-login"><section className="panel">
    <h1>Kallen Monopoly Pooling</h1><h2>Check your phone</h2>
    <p>If your username belongs to an authorized account with a phone number, a code has been sent to that number.</p>
    <Message {...await searchParams}/><form action={verifyLoginCode} className="stack">
      <label>Verification code<input className="verification-input" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus/></label>
      <button className="primary">Verify and sign in</button>
    </form><p className="small muted">Codes expire in five minutes. <Link className="text-button" href="/login">Request another code</Link></p>
  </section></main></>;
}
