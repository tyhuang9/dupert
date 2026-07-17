import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TripMapProps } from './TripMap'
import { TripMapSurface } from './TripMapSurface.native'

describe('<TripMapSurface> native target', () => {
  it('keeps an accessible itinerary-first map-evaluation state without importing the browser renderer', () => {
    render(<TripMapSurface {...({} as TripMapProps)} />)

    expect(screen.getByTestId('native-map-unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /map unavailable in this native evaluation build/i }))
      .toBeInTheDocument()
  })
})
