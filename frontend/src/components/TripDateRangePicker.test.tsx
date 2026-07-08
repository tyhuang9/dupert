import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TripDateRangePicker } from './TripDateRangePicker'

function mockFieldRect() {
  const field = screen.getByText('Trip dates').closest('div')
  if (!(field instanceof HTMLElement)) {
    throw new Error('Date range field was not rendered')
  }
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
    bottom: 144,
    height: 96,
    left: 40,
    right: 400,
    top: 48,
    width: 360,
    x: 40,
    y: 48,
    toJSON: () => ({}),
  })
}

describe('<TripDateRangePicker>', () => {
  it('renders the calendar as an anchored portal outside the containing popup', async () => {
    const onChange = vi.fn()

    render(
      <div data-testid="settings-popup">
        <TripDateRangePicker
          startDate="2026-05-01"
          endDate=""
          onChange={onChange}
        />
      </div>,
    )
    mockFieldRect()

    await userEvent.click(screen.getByRole('button', { name: /trip dates/i }))

    const dialog = screen.getByRole('dialog', { name: /trip dates/i })
    expect(screen.getByTestId('settings-popup')).not.toContainElement(dialog)
    expect(document.body).toContainElement(dialog)
    expect(dialog).toContainElement(screen.getByRole('button', { name: /previous month/i }))
    expect(dialog).toContainElement(screen.getByRole('button', { name: /next month/i }))
    expect(dialog.style.maxHeight).toBe('')
    expect(dialog).toHaveStyle({
      left: '40px',
      position: 'fixed',
      top: '152px',
      width: '760px',
    })
  })

  it('keeps date selection working inside the portaled calendar', async () => {
    const onChange = vi.fn()

    render(
      <TripDateRangePicker
        startDate="2026-05-01"
        endDate=""
        onChange={onChange}
      />,
    )
    mockFieldRect()

    await userEvent.click(screen.getByRole('button', { name: /trip dates/i }))
    await userEvent.click(screen.getByRole('button', {
      name: /choose sunday, may 3, 2026/i,
    }))

    expect(onChange).toHaveBeenCalledWith({ endDate: '2026-05-03' })
  })

  it('closes the portaled calendar on Escape', async () => {
    const onChange = vi.fn()

    render(
      <TripDateRangePicker
        startDate="2026-05-01"
        endDate=""
        onChange={onChange}
      />,
    )
    mockFieldRect()

    await userEvent.click(screen.getByRole('button', { name: /trip dates/i }))
    expect(screen.getByRole('dialog', { name: /trip dates/i })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: /trip dates/i })).not.toBeInTheDocument()
  })
})
