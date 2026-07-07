# TripPlanner

A collaborative trip-planning web app. Create a trip with a date range, then for each day pin places from a map (search by keyword or category — e.g. *"chinese food"*, *"museum"*), categorize each stop (meal, activity, snack, transport, lodging), assign optional times, and drag to reorder within a day or move across days. A second pane shows the day's stops as numbered markers on a map with a route polyline and per-leg travel times.

Trips can be shared two ways:

- **Invite a friend to sign up and join** — they become a full member of the trip.
- **Share a link with someone who won't log in** — they visit the link, pick a display name, and collaborate as an anonymous guest. The owner can revoke the link in one click.

Multiple viewers see each other's edits live (under a second) without manual refresh.

## Tech stack

**Backend** — Java 21, Spring Boot 3.5, Gradle, Spring Security, Spring Data JPA, Flyway, JJWT, Bucket4j, PostgreSQL (hosted on [Neon](https://neon.tech)).

**Frontend** — Vite, React 19, TypeScript, React Router, TanStack Query, Zustand, Axios, `@microsoft/fetch-event-source` (SSE), `@vis.gl/react-google-maps`, `@dnd-kit`, `date-fns`. Plain CSS Modules.

**External services** — [Google Maps Platform](https://developers.google.com/maps) (browser map rendering plus backend-proxied Places, geocoding, photos, and routes); [Neon](https://neon.tech) (managed Postgres).

**Realtime** — Server-Sent Events (`/api/trips/{id}/stream`); events carry pointers, not payloads, so subscribers always refetch through the authenticated API.

## Prerequisites

- **JDK 21** (Temurin recommended). Verify: `java -version` reports `21`.
- **Node 20+** and **npm**.
- A **Neon** project (free tier is fine). Grab the dev-branch connection string from the Neon dashboard.
- A **Google Maps Platform** browser API key for the Maps JavaScript API. Restrict this key by HTTP referrer to `http://localhost:3000/*` for local development and to your production origins later.
- A **Google Maps Platform** server API key for backend Places API (New), Geocoding API, and Routes API requests. Restrict this key for server-side use only.

No Docker, no local Postgres install, no global Gradle.

## Setup

```bash
git clone <this repo>
cd trip-planner
cp .env.example .env
# Edit .env and fill in real values for:
#   DATABASE_URL          (Neon connection string — wrap in single quotes if it
#                          contains '&', e.g. '...?sslmode=require&channel_binding=require')
#   JWT_SECRET            (generate: openssl rand -hex 32)
#   LOG_EMAIL_PEPPER      (generate: openssl rand -hex 16)
#   GOOGLE_MAPS_SERVER_API_KEY (backend server key for Places, Geocoding, Routes, and photos)
#   VITE_GOOGLE_MAPS_BROWSER_KEY (browser key for Maps JavaScript rendering only)
#   VITE_APP_ACCESS_PASSWORD (optional soft frontend wall password)
#   VITE_GOOGLE_MAPS_MAP_ID   (optional Google Maps vector map id)
#   NVD_API_KEY           (optional, strongly recommended before Dependency-Check)
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

The backend uses the Gradle wrapper, so the first `./gradlew` invocation will fetch Gradle automatically — nothing to install ahead of time.

## Run (development)

Start both the backend and frontend from the repo root:

```bash
npm run dev
```

This sources `.env`, starts the Spring Boot backend on http://localhost:8000, starts the Vite frontend on http://localhost:3000, and stops both processes when you press `Ctrl+C`.

Open http://localhost:3000 in your browser. Vite proxies `/api/**` to the backend, so the SPA can call `/api/...` without CORS gymnastics during development.

If you prefer the direct script instead of npm:

```bash
./scripts/dev.sh
```

If Gradle complains about Java, export `JAVA_HOME` explicitly:

```bash
export JAVA_HOME="<path-to-your-jdk-21>"
```

Flyway will run the V1 migration against your Neon database on first boot.

## Other commands

**Backend** (run from `backend/`):

| Command | What it does |
|---|---|
| `./gradlew build` | Compile + run tests + assemble jar |
| `./gradlew test` | Run tests only |
| `./gradlew dependencyCheckAnalyze` | Run OWASP Dependency-Check and fail on CVSS 7+ findings |
| `./gradlew dependencyCheckUpdate` | Refresh the local OWASP Dependency-Check vulnerability database from NVD |
| `./gradlew bootJar` | Produce `build/libs/<name>.jar` for deployment |
| `./gradlew clean` | Wipe `build/` |

**Frontend** (run from `frontend/`):

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit/component tests |
| `npm audit --omit=dev` | Audit production dependency tree |

Before pushing a feature, run:

```bash
(cd backend && ./gradlew test)
(cd frontend && npm run lint)
(cd frontend && npm run test)
(cd frontend && npm run build)
(cd frontend && npm audit --omit=dev)
```

For the fastest local Dependency-Check updates, set a valid `NVD_API_KEY` and also run:

```bash
(cd backend && ./gradlew dependencyCheckUpdate)
(cd backend && ./gradlew dependencyCheckAnalyze)
```

## CI

GitHub Actions lives at `.github/workflows/ci.yml` and `.github/workflows/dependency-check-data.yml`.

On pushes to `main`, pull requests, and manual dispatches CI runs:

- backend tests on Java 21
- backend OWASP Dependency-Check against the cached vulnerability database, with HTML/JSON reports uploaded as artifacts
- frontend `npm ci`, lint, tests, production build, and production dependency audit

The CI workflow does not require app runtime secrets. Backend tests use the test profile and do not require a Neon URL, Google Maps key, or local `.env`. Dependency-Check scans do not call NVD during push or pull request CI; they restore `~/.gradle/dependency-check-data` from the latest successful data refresh. If that cache is missing, CI warns and skips the scan for that run.

The Dependency-Check Data workflow runs daily and can be dispatched manually. It uses the repository secret `NVD_API_KEY` when it is valid, falls back to an unauthenticated NVD update when the secret is missing or rejected by NVD, and saves the refreshed vulnerability database cache only after a successful update. Keep a valid `NVD_API_KEY` secret configured for faster and more reliable refreshes.

## Project layout

```
trip-planner/
├── .github/         GitHub Actions CI workflow
├── backend/         Spring Boot service (Java 21)
│   └── src/main/java/com/trip/
│       ├── config/  Security, CORS, headers, CSP, rate-limit, exception handler
│       ├── domain/  JPA entities (User, Trip, Activity, …)
│       └── web/     Controllers + access guard
├── frontend/        Vite + React + TypeScript SPA
│   └── src/
│       ├── api/     HTTP + Google Maps adapters
│       ├── auth/    Auth context + login/register
│       ├── pages/   Top-level routes
│       ├── components/  UI building blocks
│       └── hooks/   Trip data, SSE stream, …
├── .env.example     Local config template — copy to .env
└── README.md
```

## Configuration reference

| Variable | Used by | Description |
|---|---|---|
| `DATABASE_URL` | backend | Neon (or any Postgres) connection string |
| `JWT_SECRET` | backend | 32 random bytes (hex) for signing access tokens |
| `LOG_EMAIL_PEPPER` | backend | 16 random bytes (hex) for hashing emails in logs |
| `APP_FRONTEND_ORIGIN` | backend | Exact origin allowed by CORS (e.g. `http://localhost:3000`) |
| `APP_DEV_PASSWORD_RESET_SECRET` | backend | Local-only secret required by `/api/auth/dev/reset-password`; leave unset outside dev |
| `GOOGLE_MAPS_SERVER_API_KEY` | backend | Server-side Google Maps key used by backend Places autocomplete, text/nearby search, place details, photo media, geocoding, and route calculations |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | frontend | Public Google Maps browser key for Maps JavaScript rendering only; restrict by HTTP referrer to localhost and production origins |
| `VITE_APP_ACCESS_PASSWORD` | frontend | Optional lightweight app-wall password; bundled into the browser, so treat it as a soft gate only |
| `VITE_GOOGLE_MAPS_MAP_ID` | frontend | Optional Google Maps vector map id for cloud styling |
| `VITE_DEV_PASSWORD_RESET_SECRET` | frontend | Dev-only value sent by the login-page reset helper; match `APP_DEV_PASSWORD_RESET_SECRET` locally |
| `NVD_API_KEY` | backend/CI | Optional but strongly recommended key for reliable OWASP Dependency-Check NVD updates |

Values containing shell metacharacters (`&`, `;`, `$`, spaces) **must** be wrapped in single quotes in `.env`, otherwise `source .env` will silently truncate them.

## Security notes

- Trip URLs are identifiers, not access grants. Every `/api/trips/**` request goes through the backend access guard and requires either a member JWT or a valid guest-session cookie.
- Access tokens stay in memory; refresh tokens and guest-session tokens are opaque `HttpOnly` cookies.
- Production-like backend starts require `app.cookies.secure=true` and `secure.hsts.enabled=true`; the `prod` profile sets both.
- Share links store only a SHA-256 hash of the raw token and can be revoked by the trip owner.
- Anonymous guest writes require the guest cookie plus the `X-TripPlanner-Guest-Write: 1` header, and guest/share endpoints are rate limited.
- SSE events on `/api/trips/{publicId}/stream` contain only pointers such as event type, trip id, activity id, or day date; clients refetch the real data through authenticated API calls.
- The browser key is only for Maps JavaScript rendering and should be HTTP-referrer restricted. Expensive or cacheable Google web-service calls run through authenticated backend endpoints using `GOOGLE_MAPS_SERVER_API_KEY`; do not expose that server key to the frontend.
- `VITE_APP_ACCESS_PASSWORD` is a lightweight first-screen wall only. Because Vite embeds `VITE_*` values in the browser bundle, it is not a replacement for backend access control.
- Keep `.env` local-only. Commit changes to `.env.example` when configuration requirements change.
