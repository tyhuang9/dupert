import { useEffect, useRef, useState } from 'react'

export function RouteAnnouncer() {
  const [announcement, setAnnouncement] = useState('')
  const prevTitleRef = useRef<string | null>(null)

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
