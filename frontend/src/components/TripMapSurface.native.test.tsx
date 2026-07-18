import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { TripMapProps } from './TripMap'
import { TripMapSurface } from './TripMapSurface.native'

const currentDir = dirname(fileURLToPath(import.meta.url))
const mapSurfaceCss = readFileSync(join(currentDir, 'TripMapSurface.native.module.css'), 'utf8')

describe('<TripMapSurface> native target', () => {
  it('keeps an accessible itinerary-first map-evaluation state without importing the browser renderer', () => {
    render(<TripMapSurface {...({} as TripMapProps)} />)

    expect(screen.getByTestId('native-map-unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /map unavailable in this native evaluation build/i }))
      .toBeInTheDocument()
  })

  it('fills the bounded mobile map panel without sitting beneath the chrome', () => {
    expect(mapSurfaceCss).toMatch(/height:\s*100%/)
    expect(mapSurfaceCss).toMatch(/min-height:\s*0/)
    expect(mapSurfaceCss).toMatch(/var\(--mobile-header-height,\s*64px\)/)
    expect(mapSurfaceCss).toMatch(/var\(--mobile-bottom-nav-height,\s*64px\)/)
  })
})
