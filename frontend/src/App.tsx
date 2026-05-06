import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import './App.css'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import TripsPage from './pages/TripsPage'
import { RequireAuth } from './auth/RequireAuth'
import { SkipLink } from './components/SkipLink'
import { RouteAnnouncer } from './components/RouteAnnouncer'

/**
 * Router for chunk 2e. Public auth routes (`/login`, `/register`) sit
 * outside the guard; everything else nests under `<RequireAuth>` so an
 * unauthenticated visit redirects to `/login?return=...`. Most of the
 * routes inside the guard are still placeholders for Pieces 3–5.
 */

function TodoPage({ title, piece }: { title: string; piece: number }) {
  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>{title}</h1>
      <p>
        This route is a placeholder. It will be implemented in <strong>Piece {piece}</strong>.
      </p>
    </main>
  )
}

function NewTripPage() {
  return <TodoPage title="New trip" piece={3} />
}

function TripWorkspacePage() {
  const { publicId, day } = useParams()
  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Trip workspace</h1>
      <p>
        Placeholder — publicId=<code>{publicId}</code>
        {day ? (
          <>
            {' '}
            day=<code>{day}</code>
          </>
        ) : null}
      </p>
      <p>Implemented in Piece 3 (shell) and Piece 6 (map + drag-and-drop).</p>
    </main>
  )
}

function MembersPage() {
  const { publicId } = useParams()
  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Members &amp; share links</h1>
      <p>
        Placeholder for trip <code>{publicId}</code>. Implemented in Piece 5.
      </p>
    </main>
  )
}

function AcceptInvitePage() {
  return <TodoPage title="Accept invite" piece={5} />
}

function GuestOnboardingPage() {
  return <TodoPage title="Guest onboarding" piece={5} />
}

function ForbiddenPage() {
  return <TodoPage title="403 — Forbidden" piece={1} />
}

function NotFoundPage() {
  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>404 — Not found</h1>
      <p>
        We couldn&apos;t find what you were looking for.{' '}
        <Link to="/">Go home</Link>.
      </p>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SkipLink />
      <RouteAnnouncer />
      <Routes>
        {/* Public routes — auth pages and share-accept landing flows */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/share/:token" element={<AcceptInvitePage />} />
        <Route path="/share/:token/guest" element={<GuestOnboardingPage />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="/403" element={<ForbiddenPage />} />

        {/* Authenticated routes — wrapped in RequireAuth */}
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Navigate to="/trips" replace />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/new" element={<NewTripPage />} />
          <Route path="/trips/:publicId" element={<TripWorkspacePage />} />
          <Route path="/trips/:publicId/d/:day" element={<TripWorkspacePage />} />
          <Route path="/trips/:publicId/members" element={<MembersPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
