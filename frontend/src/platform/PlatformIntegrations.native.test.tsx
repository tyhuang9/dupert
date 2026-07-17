import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlatformIntegrations } from './PlatformIntegrations.native'

describe('<PlatformIntegrations> native target', () => {
  it('renders application content without the browser access gate or analytics wrapper', () => {
    render(
      <PlatformIntegrations>
        <div data-testid="native-app-content">Trip app</div>
      </PlatformIntegrations>,
    )

    expect(screen.getByTestId('native-app-content')).toBeInTheDocument()
    expect(screen.queryByLabelText(/access password/i)).not.toBeInTheDocument()
  })
})
