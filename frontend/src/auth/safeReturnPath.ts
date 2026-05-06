/**
 * Restricts the post-auth redirect target to relative paths starting with `/`,
 * defending against open-redirect via crafted `?return=https://evil.example`.
 * Returns the fallback if the input is null or an absolute URL.
 */
export function safeReturnPath(raw: string | null, fallback = '/trips'): string {
  if (!raw) return fallback
  if (raw.startsWith('//') || raw.startsWith('http://') || raw.startsWith('https://')) return fallback
  if (!raw.startsWith('/')) return fallback
  return raw
}
