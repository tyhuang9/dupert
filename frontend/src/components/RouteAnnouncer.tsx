import { useEffect, useRef, useState } from 'react'

export function RouteAnnouncer() {
  const [announcement, setAnnouncement] = useState('')
  // Seed with the current document.title so the first effect run sees no diff.
  // The browser already announces the initial title natively; announcing it
  // again here would cause a double-read on first load.
  const prevTitleRef = useRef<string>(document.title)

  // Runs after every render to detect document.title changes (route navigation).
  // The ref check prevents infinite loops: we only announce if the title changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (document.title !== prevTitleRef.current) {
      prevTitleRef.current = document.title
      setAnnouncement(document.title)
    }
  })

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  )
}
