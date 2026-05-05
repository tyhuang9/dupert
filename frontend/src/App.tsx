import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import './App.css'

/**
 * Piece 1 placeholder routing. Every route renders a minimal "TODO" page so we
 * can verify the router is wired and the production build emits the expected
 * bundle. Later pieces replace each component with its real implementation:
 *
 *   Piece 2 — LoginPage, RegisterPage
 *   Piece 3 — TripsPage, TripPage
 *   Piece 5 — AcceptInvitePage, GuestOnboardingPage
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

function LoginPage() {
  return <TodoPage title="Log in" piece={2} />
}

function RegisterPage() {
  return <TodoPage title="Register" piece={2} />
}

function TripsListPage() {
  return <TodoPage title="Your trips" piece={3} />
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
      <h1>Members & share links</h1>
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

function NotFoundPage() {
  return <TodoPage title="404 — Not found" piece={1} />
}

function ForbiddenPage() {
  return <TodoPage title="403 — Forbidden" piece={1} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/trips" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/trips" element={<TripsListPage />} />
        <Route path="/trips/new" element={<NewTripPage />} />
        <Route path="/trips/:publicId" element={<TripWorkspacePage />} />
        <Route path="/trips/:publicId/d/:day" element={<TripWorkspacePage />} />
        <Route path="/trips/:publicId/members" element={<MembersPage />} />
        <Route path="/share/:token" element={<AcceptInvitePage />} />
        <Route path="/share/:token/guest" element={<GuestOnboardingPage />} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
