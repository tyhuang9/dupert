/**
 * Restricts the post-auth redirect target to relative paths starting with `/`,
 * defending against open-redirect via crafted `?return=https://evil.example`.
 * Returns the fallback if the input is null or an absolute URL.
 */
export function safeReturnPath(raw: string | null, fallback = '/trips'): string {
  const value = raw?.trim()
  if (!value) return fallback
  if (value.length > 512) return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return fallback
  }
  if (/%(?:00|0a|0d)/i.test(value)) return fallback
  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.origin !== window.location.origin) return fallback
  } catch {
    return fallback
  }
  return value
}
