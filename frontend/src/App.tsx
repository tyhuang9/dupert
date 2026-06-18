import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import AcceptInvitePage from './pages/AcceptInvitePage'
import GuestOnboardingPage from './pages/GuestOnboardingPage'
import LoginPage from './pages/LoginPage'
import MembersPage from './pages/MembersPage'
import RegisterPage from './pages/RegisterPage'
import TripsPage from './pages/TripsPage'
import NewTripPage from './pages/NewTripPage'
import TripWorkspacePage from './pages/TripWorkspacePage'
import { RequireAuth } from './auth/RequireAuth'
import { SkipLink } from './components/SkipLink'
import { RouteAnnouncer } from './components/RouteAnnouncer'

/**
 * Router for chunk 2e. Public auth routes (`/login`, `/register`) sit
 * outside the guard; everything else nests under `<RequireAuth>` so an
 * unauthenticated visit redirects to `/login?return=...`. Most of the
 * routes inside the guard are still placeholders for Pieces 3–5.
 */

function TodoPage({ title }: { title: string }) {
  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>{title}</h1>
      <p>This page isn&apos;t ready yet — check back soon.</p>
    </main>
  )
}

function ForbiddenPage() {
  return <TodoPage title="403 — Forbidden" />
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
        <Route path="/trips/:publicId" element={<TripWorkspacePage />} />
        <Route path="/trips/:publicId/d/:day" element={<TripWorkspacePage />} />

        {/* Authenticated routes — wrapped in RequireAuth */}
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Navigate to="/trips" replace />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/new" element={<NewTripPage />} />
          <Route path="/trips/:publicId/members" element={<MembersPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
