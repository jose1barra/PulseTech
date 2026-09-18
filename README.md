# Pulse Tech · Field workspace

A mobile-friendly staff app with preloaded sample bookings and browser-local persistence. No backend or customer-site integration is required.

## Run

Requires Node.js 20 or later. No dependency installation is needed.

```sh
npm start
```

Open **http://localhost:5173**. Select a demo profile. Use the profile avatar (or the account button on desktop) to switch profiles.

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

Sample appointments are generated relative to the day the app is first opened. Job times use the browser’s local timezone. Changes remain in this browser across reloads and profile switches. Open tabs receive updates through browser storage events. Clear the `pulse-tech-demo-v1` localStorage key to start with fresh sample jobs.

Technicians see their own jobs and customer records associated with those jobs; managers see all records. Historical purchase and service summaries are available for those customers. Internal job notes are shown only within accessible jobs.

Changing an appointment’s time marks it **Rescheduled**. Reassignment alerts both the previous and new technician; schedule changes alert the assigned technician. En Route is available only for on-site appointments. Overdue follows the specified rule exactly: scheduled time has passed and status is not Done, so cancelled appointments can also be overdue. The completed-today metric counts today’s appointments currently marked Done.

All identities and records are fictional. Profile selection demonstrates role behavior, not real authentication. Data is held on the client and can be inspected using browser developer tools; this app must not store real customer information. A production version needs server-side authentication, authorization, data storage, and validation.

The only external asset request is optional Google Fonts; system fonts are used if unavailable. Application behavior requires no external services. The Node server binds to localhost and serves only the application’s public files.

## Files

- `app.js`: rendering, interactions, and browser persistence.
- `model.js`: sample data, permissions, job updates, scheduling, and notes.
- `styles.css`: visual design and responsive layouts.
- `server.mjs`: dependency-free local web server.
- `test/model.test.js`: permission, workflow, scheduling, notification, and note tests.
