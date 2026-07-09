# Development Auth Testing

Dupert has a local-only authentication testing surface for multi-user flows such as sharing, permissions, ownership, and invitations.

These endpoints are registered only when the backend runs with:

```bash
SPRING_PROFILES_ACTIVE=local
```

They are disabled outside the `local` profile. They are not available in `dev`, `test`, `staging`, or `prod`.

## Seeded Users

On local backend startup, the app idempotently creates these users if they do not already exist:

| Email | Password | Name |
|---|---|---|
| `alice@test.local` | `password` | Alice Chen |
| `bob@test.local` | `password` | Bob Martinez |
| `charlie@test.local` | `password` | Charlie Patel |
| `admin@test.local` | `password` | Admin User |

`admin@test.local` is only a named test account. It does not grant special privileges unless roles are added later.

In the local profile, email verification is disabled, new users are immediately verified, and no auth emails are sent.

## Start Locally

From the repo root:

```bash
npm run dev
```

The dev script sources `backend/.env` and defaults the backend to `SPRING_PROFILES_ACTIVE=local`.

## Log In As A Seeded User

`POST /api/dev/auth/login-as` returns the normal auth response and sets the normal refresh cookie.

```bash
curl -i \
  -c /tmp/dupert-alice.cookies \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@test.local"}' \
  http://localhost:8000/api/dev/auth/login-as
```

Use the returned `accessToken` as a bearer token:

```bash
curl -H "Authorization: Bearer ACCESS_TOKEN_FROM_RESPONSE" \
  http://localhost:8000/api/auth/me
```

## Create A Fake User

Dev-created users must use the `@test.local` domain. They are created verified with the default password `password`.

```bash
curl -s \
  -H 'Content-Type: application/json' \
  -d '{"email":"david@test.local","name":"David Kim"}' \
  http://localhost:8000/api/dev/users
```

## List, Delete, And Reseed

```bash
curl -s http://localhost:8000/api/dev/users
```

```bash
curl -i -X DELETE http://localhost:8000/api/dev/users/david@test.local
```

```bash
curl -i -X POST http://localhost:8000/api/dev/users/reseed
```

`reseed` recreates the default `@test.local` users. It does not wipe the database.

## Production Safety

- `/api/dev/**` controllers are annotated with `@Profile("local")`.
- Dev endpoints only operate on `@test.local` users.
- Local registration creates verified users and sends no email.
- Production registration creates unverified users and requires email verification before login.
