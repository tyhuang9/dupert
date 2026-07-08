import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const globalCss = readFileSync(join(currentDir, '../index.css'), 'utf8')
const tripsCss = readFileSync(join(currentDir, 'TripsPage.module.css'), 'utf8')

function cssBlocks(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...css.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g'))].map(
    (match) => match[1],
  )
}

describe('TripsPage layout contract', () => {
  it('keeps the app background uniform without a top color band', () => {
    const bodyBlock = cssBlocks(globalCss, 'body')[0] ?? ''

    expect(bodyBlock).toMatch(/background:\s*var\(--color-bg\)/)
    expect(bodyBlock).not.toMatch(/linear-gradient/)
    expect(bodyBlock).toMatch(/min-height:\s*100dvh/)
  })

  it('uses internal page padding instead of vertical margins that force document scroll', () => {
    const shellBlock = cssBlocks(tripsCss, '.shell')[0] ?? ''
    const mobileBlock =
      [...tripsCss.matchAll(/@media\s*\(max-width:\s*640px\)\s*\{([\s\S]*)\}\s*$/g)][0]?.[1] ??
      ''

    expect(shellBlock).toMatch(/min-height:\s*100dvh/)
    expect(shellBlock).toMatch(/margin:\s*0 auto/)
    expect(shellBlock).toMatch(/padding-block:\s*var\(--space-8\)/)
    expect(shellBlock).not.toMatch(/margin:\s*var\(--space-/)
    expect(mobileBlock).toMatch(/\.shell\s*\{[^}]*margin:\s*0 auto/s)
    expect(mobileBlock).toMatch(/\.shell\s*\{[^}]*padding-block:\s*var\(--space-6\)/s)
  })
})
