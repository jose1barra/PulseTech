# Pulse Tech field workspace

A blue-and-black staff workspace with individual sign-in, staff invitations, and shared server-side data.

## Run locally

Requires Node.js 24 or later.

```sh
npm ci
npm start
```

Open **http://localhost:5173**. Create the owner account on first launch, then sign in with that email and password. If you already created an owner in the previous version, those credentials are imported automatically from `.private/account.json`.

Without `DATABASE_URL`, the app uses SQLite at `.private/pulse.sqlite`. All browsers connecting to this server share jobs, notes, appointments, and notifications. Browser-local demo data is no longer used; earlier localStorage edits remain in the browser but are not imported automatically. New databases start with fictional sample customers and appointments.

## Forgotten owner password

On the computer running the app, open a terminal in this project and run:

```sh
node scripts/reset-password.mjs
```

The command identifies the owner account and prompts twice for a new password of at least 12 characters. Typing is hidden. It preserves jobs and staff accounts and invalidates existing owner sessions. The app can remain running. For another installation, use the same `DATA_DIR` or `DATABASE_URL` environment as that app. This is a local administrator recovery tool, not a public password-reset endpoint.

## Team access

Open **Team** as the owner or a manager:

- Create a technician invitation, or choose an unclaimed staff profile to retain its sample assignments.
- Only the owner can invite managers. Managers can invite technicians.
- Copy the invitation link and share it privately. The recipient creates their own password.
- Links expire after 48 hours, work once, and can be revoked. Replacing an invitation cancels the previous link.
- Disable an account to end its sessions and block sign-in; enable it to restore access. The owner cannot be disabled.

Invitation email delivery is not configured. Links are shown once after creation and stored only as hashes. Account passwords use salted scrypt hashes. Sessions use random tokens in HttpOnly, SameSite cookies, expire after eight hours, and persist across app restarts. HTTPS deployments use Secure cookies.

## Shared workflows

- Technicians receive only their assigned jobs, related customers, and their own alerts.
- Managers see all jobs and can assign/reassign technicians or change appointments.
- Job status updates, notes, assignments, rescheduling, and alert read status are saved through authenticated APIs.
- Server-side authorization checks every data operation. Sending a different user ID or role from the browser cannot grant access.
- Stale job edits are rejected with a conflict message; concurrent notes are both preserved.
- Scheduling checks reserve one hour per active appointment and reject overlaps.
- The workspace refreshes about every 10 seconds when idle, without replacing an open form or dialog. Reopen a detail dialog to refresh it.
- Customer contacts/history, filters, notifications, and responsive layouts remain available.

The initial customer records are fictional. Real customer/job creation, password recovery, and account editing are future work.

## Proxmox / server deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the proposed topology, Docker Compose, reverse proxy configuration, TLS, database setup, backups, and migration from SQLite to PostgreSQL.

Set `DATABASE_URL` to use the PostgreSQL driver. A separate web server can proxy HTTPS to the app over the private network. Your database engine, private addresses, domain, and LAN/VPN versus public access still need confirmation before deployment. No servers or cluster settings have been modified.

## Tests

```sh
npm test
```

If your environment blocks Node's test-worker subprocesses:

```sh
node --test --test-isolation=none
```

The tests cover authentication, invitation lifecycle, role restrictions, shared writes, concurrency, legacy credential migration, persistence, scheduling, and notifications. All use isolated temporary databases.

A real-browser test is included and runs when `CHROME_PATH` points to an installed Chrome/Chromium executable. For PowerShell:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test --test-isolation=none test/browser.test.js
```

Browser checks cover owner setup, invitation acceptance, escaping user-entered names, technician restrictions, shared notes across two browser sessions, sign-out, invalid passwords, and mobile overflow. Screenshots are written to the ignored `test-results` directory. PostgreSQL connectivity and Docker/proxy deployment need separate validation against the target infrastructure.

## Main files

- `auth.js`: sign-in, owner setup, and invitation acceptance.
- `app.js`: workspace views and API interactions.
- `view-model.js`: presentation-only status helpers; contains no customer records.
- `server.mjs`: HTTP endpoints, sessions, access checks, and rate limiting.
- `workspace.mjs`: invitations, scoped snapshots, and shared updates.
- `database.mjs`: SQLite/PostgreSQL schema and transaction adapters.
- `model.js`: server-only sample data and workflow rules.
- `styles.css`: theme and responsive layouts.
- `scripts/migrate-to-postgres.mjs`: transactional copy into an empty PostgreSQL database.

Private credentials, databases, `.env` files, and test artifacts are excluded from Git and the Docker build.
