import { requestLoginCode } from '../actions';
import { Header, Message } from '../components';
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  return <><Header/><main className="simple-login"><section className="panel">
    <h1>Kallen Monopoly Pooling</h1><h2>Sign in</h2>
    <p>Enter your username. We’ll send a verification code to the phone number on your account.</p>
    <Message {...await searchParams}/>
    <form action={requestLoginCode} className="stack"><label>Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={40} required autoFocus/></label>
      <button className="primary">Send verification code</button></form>
    <p className="small muted">Authorized accounts only. Contact the organizer if you need access.</p>
  </section></main></>;
}
