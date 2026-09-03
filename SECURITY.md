# Security Policy

This is a hobby project that runs as a single self-hosted instance. There is no
release train and no security team — but the app sits behind a password gate and
holds league data, so reports are genuinely welcome.

## Reporting a vulnerability

Please use GitHub's [private vulnerability
reporting](https://github.com/Jabberwocky7777/SDFF-Website/security/advisories/new)
rather than opening a public issue.

Expect a reply within about a week. If a fix is warranted it lands on `main` and
ships in the next image build; there are no backports.

## Scope

Most useful:

- Authentication and session handling (`server/auth/`)
- Access-code resolution and per-league authorisation (`server/config/leagues.ts`,
  `server/auth/middleware.ts`)
- Anything reachable without a session: `/health`, `/api/setup/status`,
  `POST /api/setup`, `POST /api/auth/login`, `GET /api/auth/session`
- The Sleeper proxy and file cache (`server/sleeper/`, `server/cache.ts`)

Out of scope:

- Findings that require the commissioner password or an access code you were
  given legitimately
- Denial of service through sheer request volume
- Missing hardening headers with no demonstrated impact
- Anything in the deployment (TrueNAS, reverse proxy, network) rather than this
  code

## Operational notes for anyone self-hosting

- **Set `SESSION_SECRET`, or let the app generate one.** It is the HMAC key for
  session cookies. Sessions are stateless, so anyone holding that value can mint
  an admin cookie. Never commit it.
- **Do not leave the app publicly reachable while `RESET_ADMIN` is set.** It
  clears the commissioner password, which reopens `POST /api/setup` until a new
  one is set — the first caller in that window becomes commissioner.
- **Put it behind a reverse proxy that terminates TLS.** The app trusts one
  proxy hop for `X-Forwarded-For`; exposing the container port directly means
  clients can spoof their own IP and weaken the login rate limit.
- **Access codes are low-entropy shared secrets**, stored in plaintext so the
  commissioner can read them back. Treat them as "keeps strangers out", not as
  per-user authentication.
