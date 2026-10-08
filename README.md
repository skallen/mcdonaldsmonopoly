# Kallen Monopoly Pooling

An invite-only Next.js / TypeScript app with a Monopoly board on the main page, shared sticker details and photos, and username plus SMS-code login. PostgreSQL is hosted on Neon; no database or SMS credentials are committed.

## Local setup

Requires Node.js 22.9+ and a PostgreSQL database (Neon or local).

1. Run `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your Neon connection string. Preserve `sslmode=require`. Never put it in a `NEXT_PUBLIC_` variable.
3. Run `npm run db:migrate`. The runner tracks checksums in `tbl_schema_migration`, applies new SQL files in order, and safely records databases where `001_initial.sql` was applied before tracking existed. Repeated runs skip applied migrations.
4. Configure a Twilio Verify service with six-digit SMS codes. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID` to `.env.local` (see `.env.example`) and your web host. Keep them server-only. Missing credentials disable SMS login; there is no development code or password fallback.
5. Create an authorized account: `npm run user:invite -- scott you@example.com First Last +13125550123`. Use the person's actual international E.164 phone number. The username is case-insensitive, 3–40 letters/numbers/dots/underscores/hyphens. The command creates the account but does not send a message.
6. Run `npm run dev` and open http://localhost:3000.
7. Enter the username, then the verification code sent to the recorded phone. Create a board and add other invited users to it by email. Enter sticker names, printed numbers, and codes, with an optional JPEG/PNG/WebP scan up to 5 MB.

### Linked Neon project

This directory is linked to project `royal-sound-50749791` (`mcdmono`), branch `production`. Neon Auth and the private `tickets` bucket are declared in `neon.ts` and deployed. Neon writes the server-only database, Auth, and storage environment variables to the gitignored `.env.local`; the app and account invitation commands load that file. Schema migrations prefer `DATABASE_URL_UNPOOLED`.

The project pins Neon CLI 8.0.12 locally. Use `npm run neon -- status` and `npm run neon -- deploy` to avoid an older Homebrew CLI earlier on your shell's PATH. Neon skills are installed in `.agents/skills`; Neon MCP is configured globally for Codex and Claude Code. Restart the agent session to load the new MCP configuration.

Neon Auth and the bucket are provisioned infrastructure. The current app uses its invite-only authorization records, Twilio Verify for SMS challenges, and database sessions; scans remain in PostgreSQL. `neon deploy` applies backend configuration; it does not publish this Next.js website.

### Existing accounts

`002_phone_login.sql` preserves users and assigns each existing account a unique `user_<ID without hyphens>` username. An operator can change it to a friendly username and correct the recorded phone number. Existing legacy phone values are preserved, but SMS login requires valid E.164 format. The migration signs out existing sessions so all accounts must complete phone verification. Old password hashes and login-attempt records are retained for compatibility; the app has no password-login path.

```sql
UPDATE tbl_user SET username = 'scott', phone_number = '+13125550123'
WHERE email = 'you@example.com';
```

Use the account's actual number. Updating the phone immediately invalidates its existing sessions because each session is bound to the verified number. Only the trusted operator can set usernames and phone numbers; the login form cannot supply or replace the SMS destination.

### Board display

The home page title is **Kallen Monopoly Pooling**. Its 40 spaces show the classic US layout by default and use the selected edition's `tblkp_square` names, colors, and numbers wherever `boardLocation` is configured. These fallback labels do not seed or claim an official McDonald's promotion catalog. A collected badge counts available stickers for that square on the selected private board. Tabs switch between the signed-in user's boards; the center links to sticker entry and sharing.

The edition is a catalog key such as `US 2026`. Boards using the same edition share lookup definitions, but each board's tickets stay private. Use a consistent edition label.

## Data model

All physical tables use your prefixes. Quoted identifiers preserve `ID`, `firstName`, `lastName`, `tbl_gameBoard`, and the other requested camelCase names. SQL must quote these names exactly.

| Table | Purpose |
| --- | --- |
| `tbl_user` | Username, first/last names, recorded phone number, unique lowercase email, authorization status, optional external identity subject; legacy password hash retained |
| `tbl_ticket` | Name, printed number, private code, board, edition, lookup square, submitter, optional scan, redemption status |
| `tblkp_square` | Edition-specific square definitions: name, number, color, prize, other numbers, and board position (0–39) |
| `tbl_gameBoard` | Named private collection with an edition and creator |
| `tbljn_users_gameBoard` | Board membership and owner/member role |
| `tbljn_ticket_user` | Associations between tickets and members of the same board; submission creates the initial association |
| `tbl_session` | Hashed session tokens, verified phone number, and expiry |
| `tbl_login_challenge` | Hashed browser challenge tokens, Twilio verification SID, saved destination, expiry, and attempt count |
| `tbl_login_rate_limit` | Per-username SMS resend cooldown and request limits across server instances |
| `tbl_schema_migration` | Applied migration filenames, checksums, and timestamps |
| `tbl_login_attempt` | Legacy password-login throttling records, unused by the current login flow |

Ticket codes are unique within a board. Different copies of the same square can be entered with different codes. Matching a square happens at submission by edition and printed number; entries without a matching lookup remain valid. `otherNumbers` lists companion pieces for a set. Board progress counts available tickets with a matched lookup square.

The ticket-user join is reserved for explicit user associations; board membership grants shared viewing. It does not represent transfer of physical sticker ownership.

No official square/prize catalog is seeded: the promotion country and year must be confirmed. Populate `tblkp_square` with verified details **before** entering tickets to enable progress tracking. For example, use a parameterized SQL insert into `(name, number, color, prize, "otherNumbers", "boardLocation", game_edition)` with the actual promotion details.

## Access and operations

There is no public registration. The trusted operator authorizes users with the invitation CLI. The board creator becomes its owner and can add authorized members. Every protected page, mutation, and scan endpoint checks authorization and board membership. A sticker's submitter or board owner can mark it redeemed or available. Next.js server actions provide same-origin checks for mutations. Use HTTPS in production so secure session cookies work.

To revoke an account using your database console:

```sql
UPDATE tbl_user SET is_authorized = false, is_admin = false
WHERE email = 'person@example.com';
```

Authorization and the verified phone number are checked on every request. Revoked accounts cannot read boards, download scans, or submit changes, even with an unexpired session. Login codes expire locally after five minutes, allow five check attempts, and can be used only once. SMS requests allow three sends per username per 15 minutes, with a 60-second resend cooldown. Unknown, unauthorized, and missing-phone accounts receive the same challenge page without an SMS. Twilio generates, delivers, and validates the code; the app stores neither plaintext codes nor codes in logs. Configure Twilio Verify's fraud protections and appropriate SMS destination permissions on your service.

Username plus SMS is passwordless phone verification, not two independent authentication factors: the username is an identifier. True MFA would additionally require a password or passkey. If a user loses their phone, the trusted operator must confirm their identity before updating the recorded number; there is no self-service number change or public registration.

Scans are stored in PostgreSQL for this initial implementation and served through authenticated routes with `private, no-store`. The application validates size and image signatures; it does not perform OCR. At larger scale, use private object storage and keep storage keys in the database. Codes are visible to board members, so invite only people you trust to redeem them appropriately.

The runtime database connection belongs only on the server. Use a dedicated database/role; never expose its credentials to a browser. Access is enforced by the app; database foreign keys enforce board consistency. PostgreSQL RLS is not configured. The `is_admin` field is reserved; account provisioning currently uses the operator CLI.

## Verification

```sh
npm test
npm run typecheck
npm run build
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database.sql
```

The SQL test rolls back its fixtures. Use a disposable database for integration testing. Serve a production build with `npm start`; configure the same server-only `DATABASE_URL` on your host. The Neon backend has been configured; publishing the Next.js app to a web host has not been performed.

With the app running against an isolated, migrated database, run tests with `INTEGRATION_BASE_URL=http://127.0.0.1:3000 INTEGRATION_DATABASE_URL=your_test_database_url npm test`. Both URLs must point to the same test environment. Tests use stub SMS verifiers and send no real texts. They exercise challenge expiry, rate limits, wrong codes, replay and concurrent checks, saved-number changes, authorization revocation, board rendering, sticker sharing, and CSRF rejection. Actual SMS delivery must be checked with your configured Twilio account and a consented test number.
