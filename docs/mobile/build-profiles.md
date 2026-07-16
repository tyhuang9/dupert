# Web and native build profiles

Dupert has six compile-time profiles. The selected target is never inferred from
a user agent, URL, or a Capacitor global. Vite validates the mode and injects
immutable target and environment constants; application code reads the typed
`platformRuntime` facade instead of scattering platform checks.

| Mode | Target | Environment | Backend requirement |
| --- | --- | --- | --- |
| `web-development` | web | development | Same-origin `/api` is allowed. |
| `web-staging` | web | staging | Same-origin `/api` is allowed. |
| `web-production` | web | production | Same-origin `/api` is allowed. |
| `native-development` | native | development | Explicit absolute `http` or `https` backend URL. |
| `native-staging` | native | staging | Explicit deployed HTTPS backend URL. |
| `native-production` | native | production | Explicit deployed HTTPS backend URL; browser Maps and app-wall values must be empty. |

`npm run dev` stays web development. `npm run build` remains the web-production
Vercel-compatible build. Run the corresponding `dev:web:*`, `build:web:*`, or
`build:native:*` script from `frontend/` for an explicit profile.

Native builds are deliberately rejected when their backend URL is blank,
relative, uses credentials/query/fragment data, targets localhost/loopback, or
uses a placeholder in staging or production. `VITE_*` values are public build
configuration, never a secret transport.

## Target boundaries

Native entry aliases omit the browser AppAccessGate, Vercel Speed Insights, and
the browser Google Maps renderer/loader. Until issue #66 selects and verifies a
native renderer, the native target exposes an accessible map-evaluation state
and keeps the itinerary usable. Every `build:native:*` command runs an artifact
scan that rejects service-worker registration, browser Maps, AppAccessGate
configuration, analytics, and configured browser-value leakage.

The platform facade owns foreground/background lifecycle subscription. Native
bridge events will be connected only after the native projects exist; callers
must use this facade rather than adding direct Capacitor globals.

## Deferred native setup

Capacitor packages, `capacitor.config`, generated iOS/Android projects, native
origins, signing, and `cap sync` commands intentionally remain absent until the
permanent iOS bundle ID and Android application ID are confirmed. Once real
devices are available, record the observed native origins before adding exact
backend CORS entries (normally `capacitor://localhost` on iOS and
`https://localhost` on Android). No native HTTP/cookie/storage patches,
permissions, or Maps permissions are authorized by this issue.
