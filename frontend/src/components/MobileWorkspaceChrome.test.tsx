import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  MobileWorkspaceChrome,
  type MobileMapDayVisibilityModel,
} from './MobileWorkspaceChrome'
import styles from './MobileWorkspaceChrome.module.css'

interface RenderChromeOptions {
  canEditTrip?: boolean
  isAuthenticated?: boolean
  mapDayVisibility?: MobileMapDayVisibilityModel
  onOpenSettings?: () => void
  onOpenShare?: () => void
}

function renderChrome({
  canEditTrip = true,
  isAuthenticated = true,
  mapDayVisibility,
  onOpenSettings = vi.fn(),
  onOpenShare = vi.fn(),
}: RenderChromeOptions = {}) {
  return render(
    <MemoryRouter>
      <MobileWorkspaceChrome
        activeTab="map"
        canEditTrip={canEditTrip}
        isAuthenticated={isAuthenticated}
        mapDayVisibility={mapDayVisibility}
        onOpenSettings={onOpenSettings}
        onOpenShare={onOpenShare}
        onSelectTab={vi.fn()}
        publicId="abc123"
        tripName="Monterey"
      />
    </MemoryRouter>,
  )
}

async function openDrawer() {
  const trigger = screen.getByRole('button', { name: /open trip menu/i })
  await userEvent.click(trigger)
  const drawer = await screen.findByRole('dialog', { name: /monterey/i })
  return { drawer, trigger }
}

describe('<MobileWorkspaceChrome>', () => {
  it('renders a labelled left drawer dialog and initially focuses its close control', async () => {
    renderChrome()

    const { drawer, trigger } = await openDrawer()

    expect(drawer).toHaveClass(styles.menuDrawer)
    expect(trigger).toHaveAttribute('aria-controls', 'mobile-trip-menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close trip menu/i })).toHaveFocus()
    })
  })

  it('keeps map day controls reachable while trapping keyboard focus inside the drawer', async () => {
    const user = userEvent.setup()
    renderChrome({
      mapDayVisibility: {
        days: [
          { id: 'day-1', label: 'Day 1', isVisible: true },
          { id: 'day-2', label: 'Day 2', isVisible: false },
        ],
        onShowAllDays: vi.fn(),
        onToggleDay: vi.fn(),
      },
    })

    await user.click(screen.getByRole('button', { name: /open trip menu/i }))
    await screen.findByRole('dialog', { name: /monterey/i })
    const closeButton = screen.getByRole('button', { name: /close trip menu/i })

    await waitFor(() => expect(closeButton).toHaveFocus())
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Day 2' })).toHaveFocus()
    await user.tab()
    expect(closeButton).toHaveFocus()
  })

  it('renders map day visibility controls only when a model is provided and routes their callbacks', async () => {
    const user = userEvent.setup()
    const onShowAllDays = vi.fn()
    const onToggleDay = vi.fn()
    const mapDayVisibility: MobileMapDayVisibilityModel = {
      days: [
        { id: 'day-1', label: 'Day 1', isVisible: true },
        { id: 'day-2', label: 'Day 2', isVisible: false },
      ],
      onShowAllDays,
      onToggleDay,
    }
    const withoutModel = renderChrome()

    await openDrawer()
    expect(screen.queryByRole('heading', { name: /map days/i })).not.toBeInTheDocument()

    withoutModel.unmount()
    const withModel = renderChrome({ mapDayVisibility })
    await openDrawer()

    const dayOne = screen.getByRole('button', { name: 'Day 1' })
    const dayTwo = screen.getByRole('button', { name: 'Day 2' })
    expect(dayOne).toHaveAttribute('aria-pressed', 'true')
    expect(dayTwo).toHaveAttribute('aria-pressed', 'false')

    await user.click(dayTwo)
    expect(onToggleDay).toHaveBeenCalledWith('day-2')

    await user.click(screen.getByRole('button', { name: /show all days/i }))
    expect(onShowAllDays).toHaveBeenCalledOnce()

    withModel.unmount()
    renderChrome({
      mapDayVisibility: {
        ...mapDayVisibility,
        days: mapDayVisibility.days.map((day) => ({ ...day, isVisible: true })),
      },
    })
    await openDrawer()
    expect(screen.getByRole('button', { name: /show all days/i })).toBeDisabled()
  })

  it('closes on Escape or backdrop dismissal and restores focus to the menu trigger', async () => {
    const user = userEvent.setup()
    renderChrome()

    const { trigger } = await openDrawer()
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /monterey/i })).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })

    await user.click(trigger)
    const reopenedDrawer = await screen.findByRole('dialog', { name: /monterey/i })
    fireEvent.mouseDown(reopenedDrawer.parentElement as HTMLElement)
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /monterey/i })).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })
  })

  it('keeps members authenticated-only and hides editable actions for view-only members', async () => {
    const user = userEvent.setup()
    renderChrome({
      isAuthenticated: true,
      canEditTrip: false,
    })

    await user.click(screen.getByRole('button', { name: /open trip menu/i }))
    expect(screen.getByRole('link', { name: /members/i })).toHaveAttribute('href', '/trips/abc123/members')
    expect(screen.queryByRole('button', { name: /share trip/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /trip settings/i })).not.toBeInTheDocument()
  })

  it('hides Members for guests', async () => {
    const user = userEvent.setup()
    renderChrome({ isAuthenticated: false, canEditTrip: false })

    await user.click(screen.getByRole('button', { name: /open trip menu/i }))
    expect(screen.queryByRole('link', { name: /members/i })).not.toBeInTheDocument()
  })

  it('routes editable actions through their callbacks', async () => {
    const user = userEvent.setup()
    const onOpenShare = vi.fn()
    const onOpenSettings = vi.fn()
    renderChrome({ onOpenShare, onOpenSettings })

    const { trigger } = await openDrawer()
    await user.click(screen.getByRole('button', { name: /share trip/i }))
    expect(onOpenShare).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: /monterey/i })).not.toBeInTheDocument()

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: /trip settings/i }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})
