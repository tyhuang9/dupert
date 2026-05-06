import { useEffect } from 'react'

/**
 * Sets `document.title` for the lifetime of the calling component.
 * Each route owns its own title; `index.html`'s static `<title>` is
 * overwritten on every mount, so no need to keep it in sync.
 */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title
  }, [title])
}
