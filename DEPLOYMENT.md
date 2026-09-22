# Hosting Pulse Tech on your Proxmox infrastructure

The application is prepared for a Node.js app server, your existing web server as an HTTPS reverse proxy, and a separate PostgreSQL database VM or LXC. No Proxmox, web-server, or database settings have been changed by this project.

```text
Staff browser -> HTTPS web server -> Node app (private port 5173)
                                      |
                                      +-> PostgreSQL (private port 5432)
```

The local preview uses SQLite. Set `DATABASE_URL` to switch to PostgreSQL. Both modes keep accounts, sessions, invitations, customers, jobs, and alerts on the server. PostgreSQL is the prepared external database option; MySQL/MariaDB is not implemented.

## Information needed before deployment

- Which database engine/version is installed, and its private hostname/IP.
- Whether the app runs in Docker, a VM, or an LXC.
- Which web server terminates HTTPS, and the hostname staff will use.
- Whether staff connect only through LAN/VPN or through a public hostname.

Do not send database passwords in chat. Enter them in the server's environment or secret store.

## Database server

Create a dedicated `pulsetech` database and a non-superuser login that owns that database/schema. The application creates its tables and indexes at startup. Restrict database access to the app server's private address. Do not publish port 5432 to the internet.

Use a connection URL such as:

```text
postgresql://pulsetech:URL_ENCODED_PASSWORD@db.internal:5432/pulsetech?sslmode=verify-full
```

Use the database certificate's hostname. For a private CA, install its certificate in the container/VM trust configuration (for example `NODE_EXTRA_CA_CERTS` pointing to a mounted CA file). Match TLS settings to the database's actual configuration; do not turn certificate validation off to hide a connection error. See [node-postgres TLS configuration](https://node-postgres.com/features/ssl).

## App server with Docker Compose

1. Copy `.env.example` to `.env` on the application server.
2. Set the actual `DATABASE_URL`, `APP_ORIGIN` (exact HTTPS origin, no trailing slash), and a long random `SETUP_TOKEN`.
3. Keep `BIND_IP=127.0.0.1` if the reverse proxy runs on that host. If the proxy is on a different VM, set it to the app VM's private address and allow port 5173 only from the proxy.
4. Run `docker compose up -d --build`.
5. Route the full hostname to the app through the existing web server. See `deploy/nginx.conf.example`; replace the upstream address if the proxy is separate.
6. Open the HTTPS hostname and use `SETUP_TOKEN` once to create the owner. Future visits show normal sign-in.

Compose refuses to start without the required environment values. See [Compose environment interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/). The Docker image excludes local credentials, browser test files, and `.env` files.

The web server must proxy both the page and `/api/` routes to Node. Do not serve the repository as a static directory. HTTPS mode adds the `Secure` cookie flag, so sign-in must use the configured HTTPS hostname. The app checks request origins against `APP_ORIGIN` and does not trust arbitrary forwarded headers. See [Nginx proxy configuration](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass).

## Without Docker

Install Node.js 24 or later, run `npm ci --omit=dev`, and launch `node server.mjs` using your service manager. Supply `APP_ORIGIN`, `SETUP_TOKEN`, `DATABASE_URL`, `HOST`, and `PORT` through that service's environment. A network bind requires both `APP_ORIGIN` and `SETUP_TOKEN`. Use a dedicated unprivileged service account. Node does not automatically load `.env`; for a manually managed environment file use `node --env-file=.env server.mjs` with `HOST` set as appropriate.

## Moving the local workspace to PostgreSQL

Changing `DATABASE_URL` alone selects a different database; it does not transfer SQLite records automatically.

1. Stop the local app and back up `.private`.
2. Prepare an empty dedicated PostgreSQL database; do not start the app against it yet.
3. Set `DATABASE_URL` for that database and `DATA_DIR` to the local `.private` folder.
4. Run `node scripts/migrate-to-postgres.mjs --apply`.
5. Start the app with the same `DATABASE_URL` and sign in.

The copy runs in one destination transaction, refuses any nonempty destination, and leaves SQLite unchanged. Accounts, password hashes, jobs, notes, customers, alerts, and invitations are copied. Sessions are deliberately not copied; everyone signs in again. Keep the source backup until the destination has been verified. Existing `.private/account.json` owner credentials are automatically imported the first time the new local database opens. Earlier browser-local demo edits are not automatically imported.

## Backups and cluster operation

For PostgreSQL, use your database backup tooling and verify restore into a separate database. Back up the database before upgrades. For SQLite, stop the app before copying `.private`; do not copy just the main database file while WAL writes are active.

Start with one app instance. The PostgreSQL path stores sessions and rate limits centrally and serializes workspace transactions with a transaction-scoped advisory lock, so scheduling and invite acceptance use one consistent view. It is intended for a small team; load testing and failover testing are still needed before scaling across the cluster. SQLite is for one local app instance and must not be placed on a shared network filesystem.

## Current limits

- Invitation links are copied and shared manually; no email service is connected.
- Password recovery and account editing are not yet implemented.
- The initial workspace contains fictional sample customers and appointments. Real job/customer creation is a separate next feature.
- This change is verified locally with SQLite and real-browser tests. Your PostgreSQL instance, Docker build, HTTPS proxy, backups, and cluster failover still need testing in your environment.
