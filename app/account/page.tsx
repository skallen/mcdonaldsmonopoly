import { requireUser } from '../../lib/auth';
import { Header } from '../components';
export default async function Account() {
  const user = await requireUser();
  return <><Header user={user}/><main className="account"><h1>Your account</h1><section className="panel">
    <dl className="account-details"><dt>Name</dt><dd>{user.firstName} {user.lastName}</dd><dt>Username</dt><dd>{user.username}</dd><dt>Email</dt><dd>{user.email}</dd><dt>Verification phone</dt><dd>••• ••• {user.phone_number.slice(-4)}</dd></dl>
    <p className="small">Contact the organizer to update your username or phone number.</p>
  </section></main></>;
}
