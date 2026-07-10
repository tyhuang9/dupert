import { useEffect, useState } from 'react'

function getMatches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false
}

/**
 * Keeps structural responsive changes at a single, testable boundary.
 * Presentation-only breakpoints should continue to live in CSS modules.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getMatches(query))

  useEffect(() => {
    const mediaQuery = window.matchMedia?.(query)
    if (!mediaQuery) return undefined

    const updateMatches = () => setMatches(mediaQuery.matches)
    updateMatches()
    mediaQuery.addEventListener('change', updateMatches)
    return () => mediaQuery.removeEventListener('change', updateMatches)
  }, [query])

  return matches
}
