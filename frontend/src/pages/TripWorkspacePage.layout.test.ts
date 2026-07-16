import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const workspaceCss = readFileSync(join(currentDir, 'TripWorkspacePage.module.css'), 'utf8')
const tripMapCss = readFileSync(join(currentDir, '../components/TripMap.module.css'), 'utf8')
const activityFormCss = readFileSync(join(currentDir, '../components/ActivityForm.module.css'), 'utf8')
const activityCardCss = readFileSync(join(currentDir, '../components/ActivityCard.module.css'), 'utf8')
const activityListCss = readFileSync(join(currentDir, '../components/ActivityList.module.css'), 'utf8')
const activityListSource = readFileSync(join(currentDir, '../components/ActivityList.tsx'), 'utf8')
const datePickerCss = readFileSync(join(currentDir, '../components/TripDateRangePicker.module.css'), 'utf8')
const searchShelfCss = readFileSync(join(currentDir, '../components/MapSearchResultsShelf.module.css'), 'utf8')

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
    expect(workspaceCss).toMatch(/\.dayPanel:hover,\s*\.dayPanel:focus-within,\s*\.dayPanelPinned(?:,\s*[^{}]+)*\s*\{[^}]*width:\s*var\(--sidebar-expanded-width\)/s)
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
      /scrollbar-width:\s*none/,
    )
    expect(cssBlocks(workspaceCss, '.timelineScroll').join('\n')).not.toMatch(/overflow:\s*auto/)
  })

  it('keeps the activity timeline scrollable without a visible scrollbar', () => {
    expect(cssBlocks(workspaceCss, '.timelineScroll::-webkit-scrollbar').join('\n')).toMatch(
      /display:\s*none/,
    )
    expect(cssBlocks(workspaceCss, '.timelineScroll::-webkit-scrollbar-track').join('\n')).toBe('')
    expect(cssBlocks(workspaceCss, '.timelineScroll::-webkit-scrollbar-thumb').join('\n')).toBe('')
    expect(cssBlocks(workspaceCss, '.timelineScroll::-webkit-scrollbar-thumb:hover').join('\n')).toBe('')

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

  it('keeps the mobile day navigator touch-sized with a floating add action', () => {
    const mobileAddActivityFabBlock = cssBlocks(workspaceCss, '.mobileAddActivityFab').find((block) =>
      /position:\s*fixed/.test(block),
    ) ?? ''
    const dayNavigationBlock = cssBlocks(workspaceCss, '.mobileDayNavigationButton').find((block) =>
      /min-height:\s*44px/.test(block),
    ) ?? ''
    const dayPickerBlock = cssBlocks(workspaceCss, '.mobileDayPickerHeadingButton').find((block) =>
      /min-height:\s*44px/.test(block),
    ) ?? ''
    const editorActionBlock = cssBlocks(activityCardCss, '.mobileEditorClose').find((block) =>
      /min-height:\s*44px/.test(block),
    ) ?? ''
    const editorFooterActionBlock = cssBlocks(
      activityFormCss,
      '.autosaveActions .changeDayButton',
    ).find((block) => /min-height:\s*44px/.test(block)) ?? ''
    const mobileHeaderBlock = cssBlocks(
      workspaceCss,
      '.workspaceShellMobile .timelineHeader.mobileDayPlanHeader',
    ).find((block) => /grid-template-areas:/.test(block)) ?? ''
    const mobileHeaderContentsBlock = cssBlocks(
      workspaceCss,
      '.workspaceShellMobile .mobileDayPlanHeader > div:first-child',
    ).find((block) => /display:\s*contents/.test(block)) ?? ''
    const mobileNavigatorRowBlock = cssBlocks(
      workspaceCss,
      '.workspaceShellMobile .mobileDayPlanHeader .mobileDayNavigator',
    )[0] ?? ''

    expect(mobileAddActivityFabBlock).toMatch(/position:\s*fixed/)
    expect(mobileAddActivityFabBlock).toMatch(/right:\s*var\(--space-4\)/)
    expect(mobileAddActivityFabBlock).toMatch(/bottom:\s*calc\(64px \+ var\(--space-4\) \+ env\(safe-area-inset-bottom\)\)/)
    expect(mobileAddActivityFabBlock).toMatch(/width:\s*56px/)
    expect(mobileAddActivityFabBlock).toMatch(/height:\s*56px/)
    expect(mobileAddActivityFabBlock).toMatch(/min-height:\s*56px/)
    expect(mobileAddActivityFabBlock).toMatch(/border-radius:\s*var\(--radius-pill\)/)
    expect(dayNavigationBlock).toMatch(/width:\s*44px/)
    expect(dayNavigationBlock).toMatch(/min-height:\s*44px/)
    expect(dayPickerBlock).toMatch(/min-height:\s*44px/)
    expect(editorActionBlock).toMatch(/min-height:\s*44px/)
    expect(editorFooterActionBlock).toMatch(/min-height:\s*44px/)
    expect(mobileHeaderBlock).toMatch(/display:\s*grid/)
    expect(mobileHeaderBlock).toMatch(
      /grid-template-areas:\s*'kicker'\s*'navigator'\s*'summary'/,
    )
    expect(mobileHeaderBlock).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(mobileHeaderBlock).toMatch(/gap:\s*var\(--space-2\)/)
    expect(mobileHeaderContentsBlock).toMatch(/display:\s*contents/)
    expect(workspaceCss).not.toMatch(/mobileDayPlan(?:AddActivity|Actions)/)
    expect(mobileNavigatorRowBlock).toMatch(/grid-area:\s*navigator/)
    expect(mobileNavigatorRowBlock).toMatch(/width:\s*100%/)
    expect(cssBlocks(workspaceCss, '.workspaceShellMobile .mobileDayPlanHeader .panelKicker')[0] ?? '')
      .toMatch(/grid-area:\s*kicker/)
    expect(cssBlocks(workspaceCss, '.workspaceShellMobile .mobileDayPlanHeader .panelDescription')[0] ?? '')
      .toMatch(/grid-area:\s*summary/)
  })

  it('removes sortable containing-block hints from an expanded activity editor', () => {
    const expandedSlotBlock = cssBlocks(activityListCss, '.expandedItem .cardSlot')[0] ?? ''

    expect(expandedSlotBlock).toMatch(/transform:\s*none/)
    expect(expandedSlotBlock).toMatch(/will-change:\s*auto/)
    expect(activityListSource).toMatch(/isDragging && !isExpanded \? styles\.dragging : ''/)
  })

  it('presents the mobile activity editor as the same opaque bottom sheet as create', () => {
    const mobileCreateComposerBlock = cssBlocks(
      workspaceCss,
      '.workspaceShellMobile .composer',
    )[0] ?? ''
    const mobileExpandedCardBlock = cssBlocks(activityCardCss, '.cardExpanded').find((block) =>
      /position:\s*fixed/.test(block),
    ) ?? ''
    const mobileExpandedCardInteractionBlock = cssBlocks(
      activityCardCss,
      '.cardExpanded:hover,\n  .cardExpanded:focus-within,\n  .cardExpanded:focus-visible',
    )[0] ?? ''
    const mobileExpandedEditorBlock = cssBlocks(activityCardCss, '.cardExpanded .editorPanel')[0] ?? ''

    expect(activityCardCss).not.toMatch(/mobileEditAction/)
    for (const bottomSheetBlock of [mobileCreateComposerBlock, mobileExpandedCardBlock]) {
      expect(bottomSheetBlock).toMatch(
        /inset:\s*auto 0 calc\(64px \+ env\(safe-area-inset-bottom\)\)/,
      )
      expect(bottomSheetBlock).toMatch(/max-height:\s*min\(78dvh,\s*42rem\)/)
      expect(bottomSheetBlock).toMatch(/overflow-y:\s*auto/)
      expect(bottomSheetBlock).toMatch(
        /border-radius:\s*var\(--radius-xl\) var\(--radius-xl\) 0 0/,
      )
      expect(bottomSheetBlock).toMatch(
        /box-shadow:\s*0 -12px 34px rgb\(26 33 31 \/ 24%\)/,
      )
    }
    expect(mobileExpandedCardBlock).toMatch(/padding:\s*var\(--space-5\)/)
    expect(mobileExpandedCardBlock).toMatch(/background-color:\s*var\(--color-surface\)/)
    expect(mobileExpandedCardBlock).toMatch(/opacity:\s*1/)
    expect(mobileExpandedCardBlock).toMatch(/animation:\s*none/)
    expect(mobileExpandedCardInteractionBlock).toMatch(/background-color:\s*var\(--color-surface\)/)
    expect(mobileExpandedEditorBlock).toMatch(/width:\s*100%/)
    expect(mobileExpandedEditorBlock).toMatch(/max-width:\s*none/)
    expect(mobileExpandedEditorBlock).toMatch(/background-color:\s*var\(--color-surface\)/)
    expect(mobileExpandedEditorBlock).toMatch(/opacity:\s*1/)
    expect(mobileExpandedEditorBlock).toMatch(/animation:\s*none/)
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
    expect(activityButtonBlock).toMatch(/min-height:\s*62px/)
    expect(activityButtonBlock).toMatch(/border:\s*0/)
    expect(activityButtonBlock).toMatch(/background:\s*transparent/)
    expect(activityButtonBlock).not.toMatch(/box-shadow:/)
    expect(workspaceCss).not.toMatch(/timelineActivityStatus/)
  })

  it('keeps the Ideas list unframed while preserving lightweight drop feedback', () => {
    const ideasLaneBlock = cssBlocks(workspaceCss, '.ideasLane')[0] ?? ''
    const ideasDropBlock = cssBlocks(workspaceCss, '.ideasLaneDropTarget')[0] ?? ''
    const ideasOverBlock = cssBlocks(workspaceCss, '.ideasLaneOver')[0] ?? ''

    expect(ideasLaneBlock).not.toMatch(/border:/)
    expect(ideasLaneBlock).not.toMatch(/padding:/)
    expect(ideasLaneBlock).not.toMatch(/background:/)
    expect(ideasDropBlock).toMatch(/box-shadow:\s*inset 3px 0 0/)
    expect(ideasOverBlock).toMatch(/box-shadow:\s*inset 3px 0 0 var\(--color-primary\)/)
  })

  it('keeps the map sized by its bounded workspace panel', () => {
    for (const selector of ['.mapShell', '.fallback']) {
      const block = cssBlocks(tripMapCss, selector).join('\n')

      expect(block).toMatch(/height:\s*100%/)
      expect(block).toMatch(/min-height:\s*0/)
    }

    expect(tripMapCss).not.toMatch(/min-height:\s*(?:24|30)rem/)
  })

  it('keeps the date picker popup height independent of visible month row count', () => {
    const panelBlock = cssBlocks(datePickerCss, '.datePickerPanel')[0] ?? ''
    const areaBlock = cssBlocks(datePickerCss, '.datePickerCalendarArea')[0] ?? ''
    const monthsBlock = cssBlocks(datePickerCss, '.datePickerMonths')[0] ?? ''
    const monthBlock = cssBlocks(datePickerCss, '.calendarMonth')[0] ?? ''
    const gridBlock = cssBlocks(datePickerCss, '.calendarGrid').join('\n')
    const buttonBlock = cssBlocks(datePickerCss, '.calendarDateButton').join('\n')
    const rangeBlock = cssBlocks(datePickerCss, '.calendarDateButton::before')[0] ?? ''
    const previousButtonBlock = cssBlocks(datePickerCss, '.dateNavButtonPrevious')[0] ?? ''
    const nextButtonBlock = cssBlocks(datePickerCss, '.dateNavButtonNext')[0] ?? ''

    expect(panelBlock).toMatch(/--date-picker-day-size:\s*2\.5rem/)
    expect(panelBlock).toMatch(
      /--date-picker-grid-height:\s*calc\(var\(--date-picker-day-size\) \* 6\)/,
    )
    expect(panelBlock).toMatch(/--date-nav-overlap:\s*1\.5rem/)
    expect(panelBlock).toMatch(/overflow:\s*visible/)
    expect(panelBlock).not.toMatch(/overflow-y:/)
    expect(panelBlock).not.toMatch(/overscroll-behavior/)
    expect(cssBlocks(datePickerCss, ".datePickerPanel[data-placement='above']")[0] ?? '').toMatch(
      /border-bottom-right-radius:\s*0/,
    )
    expect(areaBlock).toMatch(/min-height:\s*var\(--date-picker-grid-height\)/)
    expect(monthsBlock).toMatch(/align-items:\s*start/)
    expect(monthBlock).toMatch(
      /grid-template-rows:\s*auto auto var\(--date-picker-grid-height\)/,
    )
    expect(gridBlock).toMatch(/min-height:\s*var\(--date-picker-grid-height\)/)
    expect(gridBlock).toMatch(/grid-auto-rows:\s*var\(--date-picker-day-size\)/)
    expect(buttonBlock).toMatch(/border:\s*0/)
    expect(rangeBlock).toMatch(/right:\s*0/)
    expect(rangeBlock).toMatch(/left:\s*0/)
    expect(previousButtonBlock).toMatch(
      /left:\s*calc\(-1 \* \(var\(--space-5\) \+ var\(--date-nav-overlap\)\)\)/,
    )
    expect(nextButtonBlock).toMatch(
      /right:\s*calc\(-1 \* \(var\(--space-5\) \+ var\(--date-nav-overlap\)\)\)/,
    )
  })

  it('keeps the selected-place detail card compact above search results', () => {
    const cardBlock = cssBlocks(workspaceCss, '.placeDetailCard')[0] ?? ''
    const raisedBlock = cssBlocks(workspaceCss, '.placeDetailCardRaised')[0] ?? ''
    const heroBlock = cssBlocks(workspaceCss, '.placeHero')[0] ?? ''
    const bodyBlock = cssBlocks(workspaceCss, '.placeDetailBody')[0] ?? ''
    const bodyScrollbarBlock = cssBlocks(workspaceCss, '.placeDetailBody::-webkit-scrollbar')[0] ?? ''
    const actionsBlock = cssBlocks(workspaceCss, '.placeDetailActions')[0] ?? ''
    const primaryActionBlock = cssBlocks(workspaceCss, '.placeDetailActions .primaryAction')[0] ?? ''

    expect(cardBlock).toMatch(/width:\s*min\(18\.75rem,\s*calc\(100% - var\(--space-8\)\)\)/)
    expect(cardBlock).toMatch(/max-height:\s*min\(28rem,\s*80dvh\)/)
    expect(cardBlock).toMatch(/grid-template-rows:\s*auto minmax\(0,\s*1fr\)/)
    expect(raisedBlock).toMatch(
      /bottom:\s*calc\(var\(--map-search-results-height\) \+ var\(--map-search-results-gap\)\)/,
    )
    expect(heroBlock).toMatch(/aspect-ratio:\s*16 \/ 9/)
    expect(heroBlock).toMatch(/min-height:\s*9\.25rem/)
    expect(heroBlock).toMatch(/max-height:\s*min\(11rem,\s*30dvh\)/)
    expect(bodyBlock).toMatch(/min-height:\s*0/)
    expect(bodyBlock).toMatch(/overflow-y:\s*auto/)
    expect(bodyBlock).toMatch(/scrollbar-width:\s*none/)
    expect(bodyScrollbarBlock).toMatch(/display:\s*none/)
    expect(actionsBlock).toMatch(/flex-wrap:\s*nowrap/)
    expect(primaryActionBlock).toMatch(/min-width:\s*8rem/)
    expect(primaryActionBlock).toMatch(/flex:\s*0 1 auto/)
  })

  it('keeps map search results and route controls using the available map space', () => {
    const mapPanelBlock = cssBlocks(workspaceCss, '.mapPanel')[0] ?? ''
    const mapChromeBlock = cssBlocks(workspaceCss, '.mapChrome')[0] ?? ''
    const routeOverlayBlock = cssBlocks(workspaceCss, '.mapRouteOverlay')[0] ?? ''
    const mapSearchLayoutBlock = cssBlocks(workspaceCss, '.mapSearchAndStyle')[0] ?? ''
    const routeSummaryBlock = cssBlocks(tripMapCss, '.routeSummary')[0] ?? ''
    const shelfBlock = cssBlocks(searchShelfCss, '.shelf')[0] ?? ''

    expect(mapPanelBlock).toMatch(/--map-search-results-height:\s*11\.25rem/)
    expect(mapPanelBlock).toMatch(/--map-search-results-gap:\s*var\(--space-5\)/)
    expect(mapPanelBlock).toMatch(/--map-route-controls-width:\s*15\.25rem/)
    expect(mapPanelBlock).toMatch(/--map-route-summary-width:\s*12rem/)
    expect(mapPanelBlock).toMatch(/--map-search-max-width:\s*34rem/)
    expect(mapChromeBlock).toMatch(/width:\s*auto/)
    expect(mapChromeBlock).toMatch(/justify-content:\s*flex-end/)
    expect(routeOverlayBlock).toMatch(/display:\s*grid/)
    expect(routeOverlayBlock).toMatch(/justify-items:\s*end/)
    expect(mapSearchLayoutBlock).toMatch(/display:\s*block/)
    expect(workspaceCss).toMatch(
      /width:\s*min\(\s*var\(--map-search-max-width\),\s*calc\(\s*100% - var\(--space-8\) - var\(--map-route-controls-width\) -\s*var\(--map-route-summary-width\) - var\(--space-4\)\s*\)\s*\)/,
    )
    expect(routeSummaryBlock).toMatch(
      /right:\s*calc\(var\(--space-4\) \+ var\(--map-route-controls-width,\s*15\.25rem\) \+ var\(--space-2\)\)/,
    )
    expect(routeSummaryBlock).toMatch(/width:\s*min\(var\(--map-route-summary-width,\s*12rem\)/)
    expect(routeSummaryBlock).not.toMatch(/(?:^|\n)\s*height:\s*42px/)
    expect(routeSummaryBlock).toMatch(/min-height:\s*42px/)
    expect(routeSummaryBlock).toMatch(/padding:\s*var\(--space-1\) var\(--space-3\)/)
    expect(shelfBlock).toMatch(/right:\s*var\(--space-4\)/)
    expect(shelfBlock).not.toMatch(/right:\s*calc/)
  })

  it('uses a safe-area-aware vertical results sheet and full-width detail sheet on mobile', () => {
    const shelfBlocks = cssBlocks(searchShelfCss, '.shelf')
    const listBlocks = cssBlocks(searchShelfCss, '.list')
    const closeBlocks = cssBlocks(searchShelfCss, '.closeButton')
    const detailCardBlocks = cssBlocks(workspaceCss, '.workspaceShellMobileMap .placeDetailCard')
    const mobileControlBlocks = cssBlocks(
      workspaceCss,
      '.workspaceShellMobileMap .placeDetailMobileControls',
    )
    const heroBlocks = cssBlocks(workspaceCss, '.workspaceShellMobileMap .placeHero')
    const mobileBodyBlocks = cssBlocks(workspaceCss, '.workspaceShellMobileMap .placeDetailBody')
    const mobileActionsBlocks = cssBlocks(
      workspaceCss,
      '.workspaceShellMobileMap .placeDetailActions',
    )
    const mobileShelfBlock = shelfBlocks[shelfBlocks.length - 1] ?? ''
    const mobileListBlock = listBlocks[listBlocks.length - 1] ?? ''
    const mobileCloseBlock = closeBlocks[closeBlocks.length - 1] ?? ''
    const mobileDetailCardBlock = detailCardBlocks.find((block) => /top:\s*auto/.test(block)) ?? ''
    const mobileControlBlock = mobileControlBlocks[mobileControlBlocks.length - 1] ?? ''
    const mobileHeroBlock = heroBlocks[heroBlocks.length - 1] ?? ''
    const mobileBodyBlock = mobileBodyBlocks[mobileBodyBlocks.length - 1] ?? ''
    const mobileActionsBlock = mobileActionsBlocks[mobileActionsBlocks.length - 1] ?? ''

    expect(mobileShelfBlock).toMatch(/position:\s*static/)
    expect(mobileShelfBlock).toMatch(/flex:\s*0 1 auto/)
    expect(mobileShelfBlock).toMatch(/min-height:\s*0/)
    expect(mobileShelfBlock).toMatch(/max-height:\s*min\(46dvh,\s*100%\)/)
    expect(mobileShelfBlock).toMatch(/margin-top:\s*auto/)
    expect(mobileShelfBlock).toMatch(/grid-template-rows:\s*auto minmax\(0,\s*1fr\)/)
    expect(mobileListBlock).toMatch(/flex-direction:\s*column/)
    expect(mobileListBlock).toMatch(/overflow-x:\s*hidden/)
    expect(mobileListBlock).toMatch(/overflow-y:\s*auto/)
    expect(mobileListBlock).toMatch(/touch-action:\s*pan-y/)
    expect(mobileCloseBlock).toMatch(/width:\s*44px/)
    expect(mobileCloseBlock).toMatch(/height:\s*44px/)
    expect(mobileDetailCardBlock).toMatch(/top:\s*auto/)
    expect(mobileDetailCardBlock).toMatch(/bottom:\s*0/)
    expect(mobileDetailCardBlock).toMatch(/z-index:\s*17/)
    expect(mobileDetailCardBlock).toMatch(/width:\s*100%/)
    expect(mobileDetailCardBlock).toMatch(
      /max-height:\s*min\(calc\(100dvh - 128px - env\(safe-area-inset-bottom\)\),\s*42rem\)/,
    )
    expect(mobileDetailCardBlock).toMatch(/grid-template-rows:\s*auto minmax\(0,\s*1fr\)/)
    expect(mobileControlBlock).toMatch(/position:\s*absolute/)
    expect(mobileControlBlock).toMatch(/inset:\s*var\(--space-3\) var\(--space-3\) auto/)
    expect(mobileControlBlock).toMatch(/justify-content:\s*flex-end/)
    expect(mobileHeroBlock).toMatch(/display:\s*block/)
    expect(mobileHeroBlock).toMatch(/width:\s*100%/)
    expect(mobileHeroBlock).toMatch(/max-height:\s*none/)
    expect(mobileHeroBlock).toMatch(/aspect-ratio:\s*16 \/ 9/)
    expect(mobileHeroBlock).toMatch(/min-height:\s*10rem/)
    expect(mobileHeroBlock).toMatch(/margin:\s*0/)
    expect(mobileBodyBlock).toMatch(/gap:\s*var\(--space-1\)/)
    expect(mobileBodyBlock).toMatch(/padding:\s*var\(--space-3\) var\(--space-4\) var\(--space-4\)/)
    expect(mobileActionsBlock).toMatch(/position:\s*sticky/)
    expect(mobileActionsBlock).toMatch(/bottom:\s*calc\(var\(--space-4\) \* -1\)/)
  })

  it('uses a bounded mobile map overlay flow for chrome, route feedback, search, and results', () => {
    const mobileOverlayLayoutBlocks = cssBlocks(
      workspaceCss,
      '.workspaceShellMobileMap .mapOverlayLayout',
    )
    const mobileControlStackBlocks = cssBlocks(
      workspaceCss,
      '.workspaceShellMobileMap .mobileMapControlStack',
    )
    const mobileControlsBlocks = cssBlocks(workspaceCss, '.workspaceShellMobileMap .mobileMapControls')
    const mobileControlRowBlocks = cssBlocks(
      workspaceCss,
      '.workspaceShellMobileMap .mobileMapControlRow',
    )
    const mobilePopoverBlocks = cssBlocks(workspaceCss, '.workspaceShellMobileMap .mobileMapPopover')
    const mobileRouteSummaryBlocks = cssBlocks(workspaceCss, '.workspaceShellMobileMap .mapRouteSummary')
    const mobileShelfBlocks = cssBlocks(searchShelfCss, '.shelf')
    const mobileOverlayLayoutBlock = mobileOverlayLayoutBlocks[mobileOverlayLayoutBlocks.length - 1] ?? ''
    const mobileControlStackBlock = mobileControlStackBlocks[mobileControlStackBlocks.length - 1] ?? ''
    const mobileControlsBlock = mobileControlsBlocks[mobileControlsBlocks.length - 1] ?? ''
    const mobileControlRowBlock = mobileControlRowBlocks[mobileControlRowBlocks.length - 1] ?? ''
    const mobilePopoverBlock = mobilePopoverBlocks[mobilePopoverBlocks.length - 1] ?? ''
    const mobileRouteSummaryBlock = mobileRouteSummaryBlocks[mobileRouteSummaryBlocks.length - 1] ?? ''
    const mobileShelfBlock = mobileShelfBlocks[mobileShelfBlocks.length - 1] ?? ''

    expect(mobileOverlayLayoutBlock).toMatch(/position:\s*absolute/)
    expect(mobileOverlayLayoutBlock).toMatch(/top:\s*calc\(64px \+ var\(--space-3\)\)/)
    expect(mobileOverlayLayoutBlock).toMatch(
      /bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\)/,
    )
    expect(mobileOverlayLayoutBlock).toMatch(/min-height:\s*0/)
    expect(mobileOverlayLayoutBlock).toMatch(/display:\s*flex/)
    expect(mobileOverlayLayoutBlock).toMatch(/flex-direction:\s*column/)
    expect(mobileOverlayLayoutBlock).toMatch(/pointer-events:\s*none/)
    expect(workspaceCss).toMatch(
      /\.workspaceShellMobileMap \.mapOverlayLayout > \*\s*\{[^}]*pointer-events:\s*auto/s,
    )
    expect(mobileControlStackBlock).toMatch(/width:\s*min\(34rem,\s*calc\(100% - var\(--space-6\)\)\)/)
    expect(mobileControlStackBlock).toMatch(/display:\s*grid/)
    expect(mobileControlStackBlock).toMatch(/margin:\s*0 var\(--space-3\)/)
    expect(mobileControlsBlock).toMatch(/position:\s*relative/)
    expect(mobileControlsBlock).toMatch(/width:\s*100%/)
    expect(mobileControlRowBlock).toMatch(/display:\s*flex/)
    expect(mobileControlRowBlock).toMatch(/align-items:\s*stretch/)
    expect(mobilePopoverBlock).toMatch(/position:\s*absolute/)
    expect(mobilePopoverBlock).toMatch(/max-height:\s*min\(20rem,\s*calc\(100dvh - 12rem\)\)/)
    expect(mobilePopoverBlock).toMatch(/overflow-y:\s*auto/)
    expect(mobileRouteSummaryBlock).toMatch(/position:\s*static/)
    expect(mobileRouteSummaryBlock).toMatch(/min-height:\s*32px/)
    expect(mobileRouteSummaryBlock).toMatch(/border-radius:\s*var\(--radius-pill\)/)
    expect(mobileShelfBlock).toMatch(/position:\s*static/)
    expect(mobileShelfBlock).toMatch(/margin-top:\s*auto/)
    expect(workspaceCss).not.toMatch(/--map-mobile-/)
    expect(workspaceCss).not.toMatch(/:has\(/)
    const routeSummaryCss = cssBlocks(tripMapCss, '.routeSummary').join('\n')
    expect(routeSummaryCss).not.toMatch(/display:\s*none/)
    expect(routeSummaryCss).not.toMatch(/(?:^|\n)\s*height:\s*42px/)
    expect(routeSummaryCss).toMatch(/min-height:\s*42px/)
    expect(tripMapCss).toMatch(
      /\.routeSummary strong\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*white-space:\s*normal/s,
    )
  })

  it('keeps compact editable fields on token-based surfaces in dark mode', () => {
    expect(activityFormCss).not.toContain('#f3f5fb')
    expect(activityFormCss).toMatch(
      /\.compactInput:hover,\s*\.compactInput:focus-visible,\s*\.compactTextarea:hover,\s*\.compactTextarea:focus-visible\s*\{[^}]*background:\s*var\(--color-surface-2\)/s,
    )
  })
})
