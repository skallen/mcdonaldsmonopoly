import Link from 'next/link';
import { logout } from './actions';
import type { User } from '../lib/auth';
export function Header({ user }: { user?: User }) {
  return <header><Link className="brand" href="/"><span className="brand-mark">K</span> Kallen Monopoly Pooling</Link>
    {user && <nav><Link href="/">My boards</Link><Link href="/account">{user.firstName}</Link><form action={logout}><button className="secondary" name="logout" type="submit">Logout</button></form></nav>}</header>;
}
export function Message({ error, notice }: { error?: string; notice?: string }) {
  return <>{error && <p className="message error" role="alert">{error}</p>}{notice && <p className="message" role="status">{notice}</p>}</>;
}
