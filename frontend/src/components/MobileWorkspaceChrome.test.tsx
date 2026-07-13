import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MobileWorkspaceChrome } from './MobileWorkspaceChrome'
import styles from './MobileWorkspaceChrome.module.css'

interface RenderChromeOptions {
  canEditTrip?: boolean
  isAuthenticated?: boolean
  onOpenSettings?: () => void
  onOpenShare?: () => void
}

function renderChrome({
  canEditTrip = true,
  isAuthenticated = true,
  onOpenSettings = vi.fn(),
  onOpenShare = vi.fn(),
}: RenderChromeOptions = {}) {
  return render(
    <MemoryRouter>
      <MobileWorkspaceChrome
        activeTab="map"
        canEditTrip={canEditTrip}
        isAuthenticated={isAuthenticated}
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

  it('traps keyboard focus inside the drawer', async () => {
    const user = userEvent.setup()
    renderChrome()

    await user.click(screen.getByRole('button', { name: /open trip menu/i }))
    await screen.findByRole('dialog', { name: /monterey/i })
    const closeButton = screen.getByRole('button', { name: /close trip menu/i })

    await waitFor(() => expect(closeButton).toHaveFocus())
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: /trip settings/i })).toHaveFocus()
    await user.tab()
    expect(closeButton).toHaveFocus()
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
