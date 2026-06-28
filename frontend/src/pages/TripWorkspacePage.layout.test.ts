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
  it('keeps the sidebar as a 64px rail that expands as an overlay', () => {
    const workspaceBlock = cssBlocks(workspaceCss, '.workspaceShell')[0] ?? ''
    const pinnedWorkspaceBlock = cssBlocks(workspaceCss, '.workspaceShellPinned')[0] ?? ''
    const dayPanelBlock = cssBlocks(workspaceCss, '.dayPanel')[0] ?? ''
    const railIconBlock = cssBlocks(workspaceCss, '.railIcon')[0] ?? ''

    expect(workspaceBlock).toMatch(/--sidebar-rail-width:\s*64px/)
    expect(workspaceBlock).toMatch(/--sidebar-expanded-width:\s*244px/)
    expect(workspaceBlock).toMatch(/padding-left:\s*var\(--sidebar-rail-width\)/)
    expect(workspaceBlock).not.toMatch(/grid-template-columns:\s*64px/)
    expect(dayPanelBlock).toMatch(/position:\s*absolute/)
    expect(dayPanelBlock).toMatch(/z-index:\s*50/)
    expect(dayPanelBlock).toMatch(/width:\s*var\(--sidebar-rail-width\)/)
    expect(pinnedWorkspaceBlock).toMatch(/padding-left:\s*var\(--sidebar-expanded-width\)/)
    expect(workspaceCss).toMatch(/\.dayPanel:hover,\s*\.dayPanel:focus-within,\s*\.dayPanelPinned\s*\{[^}]*width:\s*var\(--sidebar-expanded-width\)/s)
    expect(railIconBlock).toMatch(/width:\s*64px/)
    expect(railIconBlock).toMatch(/flex:\s*0 0 64px/)
  })

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
    expect(cssBlocks(workspaceCss, '.timelineScroll').join('\n')).toMatch(
      /scrollbar-gutter:\s*stable/,
    )
    expect(cssBlocks(workspaceCss, '.timelineScroll').join('\n')).toMatch(
      /scrollbar-width:\s*thin/,
    )
    expect(cssBlocks(workspaceCss, '.timelineScroll').join('\n')).not.toMatch(/overflow:\s*auto/)
  })

  it('keeps immersive scrollbar styling scoped to the activity timeline', () => {
    expect(cssBlocks(workspaceCss, '.timelineScroll::-webkit-scrollbar').join('\n')).toMatch(
      /width:\s*6px/,
    )
    expect(cssBlocks(workspaceCss, '.timelineScroll::-webkit-scrollbar-track').join('\n')).toMatch(
      /background:\s*transparent/,
    )
    expect(cssBlocks(workspaceCss, '.timelineScroll::-webkit-scrollbar-thumb').join('\n')).toMatch(
      /background:\s*color-mix/,
    )
    expect(
      cssBlocks(workspaceCss, '.timelineScroll::-webkit-scrollbar-thumb:hover').join('\n'),
    ).toMatch(/background:\s*var\(--color-border-strong\)/)

    for (const selector of [
      '.shell',
      '.workspaceShell',
      '.dayPanel',
      '.timelinePanel',
      '.mapPanel',
    ]) {
      expect(cssBlocks(workspaceCss, selector).join('\n')).not.toMatch(/scrollbar-/)
    }
  })

  it('keeps full-trip timeline groups and entries visually seamless', () => {
    const fullTimelineBlock = cssBlocks(workspaceCss, '.fullTimeline')[0] ?? ''
    const dayGroupBlock = cssBlocks(workspaceCss, '.timelineDayGroup')[0] ?? ''
    const activityButtonBlock =
      cssBlocks(workspaceCss, '.timelineActivityButton').find((block) =>
        /grid-template-columns/.test(block),
      ) ?? ''

    expect(fullTimelineBlock).toMatch(/gap:\s*var\(--space-4\)/)
    expect(dayGroupBlock).not.toMatch(/border:/)
    expect(dayGroupBlock).not.toMatch(/box-shadow:/)
    expect(dayGroupBlock).not.toMatch(/background:/)
    expect(activityButtonBlock).toMatch(/grid-template-columns:\s*44px minmax\(0,\s*1fr\) auto/)
    expect(activityButtonBlock).toMatch(/min-height:\s*56px/)
    expect(activityButtonBlock).toMatch(/border:\s*0/)
    expect(activityButtonBlock).toMatch(/background:\s*transparent/)
    expect(activityButtonBlock).not.toMatch(/box-shadow:/)
    expect(workspaceCss).not.toMatch(/timelineActivityStatus/)
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
