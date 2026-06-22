import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const workspaceCss = readFileSync(join(currentDir, 'TripWorkspacePage.module.css'), 'utf8')
const tripMapCss = readFileSync(join(currentDir, '../components/TripMap.module.css'), 'utf8')

function cssBlocks(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...css.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g'))].map(
    (match) => match[1],
  )
}

describe('TripWorkspacePage layout scroll contract', () => {
  it('clips the workspace shell and leaves vertical scrolling to the activity area', () => {
    expect(workspaceCss).not.toMatch(/overflow:\s*visible/)
    expect(workspaceCss).not.toMatch(/calc\(100vh/)

    for (const selector of [
      '.shell',
      '.workspaceShell',
      '.dayPanel',
      '.timelinePanel',
      '.mapPanel',
    ]) {
      expect(cssBlocks(workspaceCss, selector).join('\n')).not.toMatch(/overflow(?:-[xy])?:\s*auto/)
    }

    expect(cssBlocks(workspaceCss, '.timelineScroll').join('\n')).toMatch(/overflow-y:\s*auto/)
    expect(cssBlocks(workspaceCss, '.timelineScroll').join('\n')).toMatch(/overflow-x:\s*hidden/)
    expect(cssBlocks(workspaceCss, '.timelineScroll').join('\n')).not.toMatch(/overflow:\s*auto/)
  })

  it('keeps the map sized by its bounded workspace panel', () => {
    for (const selector of ['.mapShell', '.fallback']) {
      const block = cssBlocks(tripMapCss, selector).join('\n')

      expect(block).toMatch(/height:\s*100%/)
      expect(block).toMatch(/min-height:\s*0/)
    }

    expect(tripMapCss).not.toMatch(/min-height:\s*(?:24|30)rem/)
  })
})
