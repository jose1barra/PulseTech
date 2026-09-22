# Pulse Tech · Field workspace

A mobile-friendly staff app with preloaded sample bookings and browser-local persistence. The included local Node server handles owner sign-in. No customer-site integration is required.

## Run

Requires Node.js 20 or later. No dependency installation is needed.

```sh
npm start
```

Open **http://localhost:5173**. On first launch, create your owner account with your name, email, and a password of at least 12 characters. Later visits require sign-in. Use the profile avatar (or the account button on desktop) to sign out.

```sh
npm test
```

## Included

- Technician dashboard, assigned jobs, search, and date/status filters.
- Manager overview, technician filters, assignment/reassignment, and appointment editing.
- One-hour appointments with overlap prevention for active jobs.
- Requested, Confirmed, En Route (on-site only), In Progress, Done, Cancelled, and Rescheduled statuses.
- Immediate status updates, staff notes, and a job activity log.
- Customer contacts, devices, purchases, and previous service records.
- In-app assignment and time-change alerts, scoped to each profile.
- Responsive desktop/mobile views, keyboard-accessible dialogs, and local persistence.

## Demo behavior

Sample appointments are generated relative to the day the app is first opened. Job times use the browser’s local timezone. Changes remain in this browser across reloads and sign-ins. Open tabs receive updates through browser storage events. Clear the `pulse-tech-demo-v1` localStorage key to start with fresh sample jobs.

Technicians see their own jobs and customer records associated with those jobs; managers see all records. Historical purchase and service summaries are available for those customers. Internal job notes are shown only within accessible jobs.

Changing an appointment’s time marks it **Rescheduled**. Reassignment alerts both the previous and new technician; schedule changes alert the assigned technician. En Route is available only for on-site appointments. Overdue follows the specified rule exactly: scheduled time has passed and status is not Done, so cancelled appointments can also be overdue. The completed-today metric counts today’s appointments currently marked Done.

Jobs and customer records are fictional and remain in browser-local storage. Owner credentials are verified by the Node server, with a salted scrypt password hash stored in `.private/account.json` (ignored by Git and never served). The server gates workspace scripts and sample records behind an HttpOnly, SameSite session cookie. Sessions expire after eight hours and are invalidated on sign-out or server restart. Owner setup is disabled once an account exists. Only the owner account is supported currently; staff invitations and password recovery are not yet implemented. This localhost preview still uses client-side job data and permissions; production use requires HTTPS, server-side job storage, and authorization on every data operation.

The visual theme uses near-black backgrounds, deep blue panels, electric-blue actions, a subtle technical grid on the sign-in screen, and system sans-serif typography. Status badges retain their functional colors. No external fonts, assets, or services are required. The Node server binds to localhost and serves only the application’s public files.

## Files

- `auth.js`: owner setup and sign-in screen.
- `app.js`: rendering, interactions, and browser persistence.
- `model.js`: sample data, permissions, job updates, scheduling, and notes.
- `styles.css`: visual design and responsive layouts.
- `server.mjs`: dependency-free local web server.
- `test/model.test.js`: permission, workflow, scheduling, notification, and note tests.
