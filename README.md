# TripPlanner

A collaborative trip-planning web app. Create a trip with a date range, then for each day pin places from a map (search by keyword or category — e.g. *"chinese food"*, *"museum"*), categorize each stop (meal, activity, snack, transport, lodging), assign optional times, and drag to reorder within a day or move across days. A second pane shows the day's stops as numbered markers on a map with a route polyline and per-leg travel times.

Trips can be shared two ways:

- **Invite a friend to sign up and join** — they become a full member of the trip.
- **Share a link with someone who won't log in** — they visit the link, pick a display name, and collaborate as an anonymous guest. The owner can revoke the link in one click.

Multiple viewers see each other's edits live (under a second) without manual refresh.

## Tech stack

**Backend** — Java 21, Spring Boot 3.5, Gradle, Spring Security, Spring Data JPA, Flyway, JJWT, Bucket4j, PostgreSQL (hosted on [Neon](https://neon.tech)).

**Frontend** — Vite, React 19, TypeScript, React Router, TanStack Query, Zustand, Axios, `@microsoft/fetch-event-source` (SSE), `mapbox-gl` + `react-map-gl`, `@mapbox/search-js-react`, `@dnd-kit`, `date-fns`. Plain CSS Modules.

**External services** — [Mapbox](https://www.mapbox.com/) (tiles, place search, directions); [Neon](https://neon.tech) (managed Postgres).

**Realtime** — Server-Sent Events (`/api/trips/{id}/stream`); events carry pointers, not payloads, so subscribers always refetch through the authenticated API.

## Prerequisites

- **JDK 21** (Temurin recommended). Verify: `java -version` reports `21`.
- **Node 20+** and **npm**.
- A **Neon** project (free tier is fine). Grab the dev-branch connection string from the Neon dashboard.
- A **Mapbox** account with a public token (`pk.…`). URL-restrict it in the Mapbox dashboard to `http://localhost:3000/*` for local development (and your production origin later).

No Docker, no local Postgres install, no global Gradle.

## Setup

```bash
git clone <this repo>
cd TripPlanner
cp .env.example .env
# Edit .env and fill in real values for:
#   DATABASE_URL          (Neon connection string — wrap in single quotes if it
#                          contains '&', e.g. '...?sslmode=require&channel_binding=require')
#   JWT_SECRET            (generate: openssl rand -hex 32)
#   LOG_EMAIL_PEPPER      (generate: openssl rand -hex 16)
#   VITE_MAPBOX_TOKEN     (Mapbox public token)
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

The backend uses the Gradle wrapper, so the first `./gradlew` invocation will fetch Gradle automatically — nothing to install ahead of time.

## Run (development)

You'll need two terminals.

**Terminal 1 — backend** (http://localhost:8000):

```bash
cd TripPlanner
set -a && source .env && set +a       # load env vars into the shell
cd backend
./gradlew bootRun
```

If Gradle complains about Java, export `JAVA_HOME` explicitly:

```bash
export JAVA_HOME="<path-to-your-jdk-21>"
```

Flyway will run the V1 migration against your Neon database on first boot.

**Terminal 2 — frontend** (http://localhost:3000):

```bash
cd TripPlanner/frontend
npm run dev
```

Open http://localhost:3000 in your browser. Vite proxies `/api/**` to the backend, so the SPA can call `/api/...` without CORS gymnastics during development.

## Other commands

**Backend** (run from `backend/`):

| Command | What it does |
|---|---|
| `./gradlew build` | Compile + run tests + assemble jar |
| `./gradlew test` | Run tests only |
| `./gradlew bootJar` | Produce `build/libs/<name>.jar` for deployment |
| `./gradlew clean` | Wipe `build/` |

**Frontend** (run from `frontend/`):

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |

## Project layout

```
TripPlanner/
├── backend/         Spring Boot service (Java 21)
│   └── src/main/java/com/trip/
│       ├── config/  Security, CORS, headers, CSP, rate-limit, exception handler
│       ├── domain/  JPA entities (User, Trip, Activity, …)
│       └── web/     Controllers + access guard
├── frontend/        Vite + React + TypeScript SPA
│   └── src/
│       ├── api/     HTTP + Mapbox clients
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
| `VITE_MAPBOX_TOKEN` | frontend | Public Mapbox token; URL-restricted in the Mapbox dashboard |
| `VITE_API_BASE_URL` | frontend | Backend base URL the SPA talks to |

Values containing shell metacharacters (`&`, `;`, `$`, spaces) **must** be wrapped in single quotes in `.env`, otherwise `source .env` will silently truncate them.
