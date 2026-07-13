import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from './client'
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
  updateTrip,
} from './trips'
import type { Trip } from '../types/trip'

let apiMock: MockAdapter

const SAMPLE_TRIP: Trip = {
  publicId: 'abc234def567',
  name: 'Tokyo 2026',
  destination: 'Tokyo, Japan',
  startDate: '2026-05-01',
  endDate: '2026-05-05',
  imageUrl: null,
  createdAt: '2026-05-22T16:00:00Z',
  role: 'OWNER',
  version: 0,
}

beforeEach(() => {
  apiMock = new MockAdapter(apiClient)
})

afterEach(() => {
  apiMock.restore()
})

describe('trip api', () => {
  it('lists trips', async () => {
    apiMock.onGet('/trips').reply(200, [SAMPLE_TRIP])

    await expect(listTrips()).resolves.toEqual([SAMPLE_TRIP])
  })

  it('gets a trip by public id', async () => {
    apiMock.onGet('/trips/abc234def567').reply(200, SAMPLE_TRIP)

    await expect(getTrip('abc234def567')).resolves.toEqual(SAMPLE_TRIP)
  })

  it('creates a trip', async () => {
    apiMock.onPost('/trips').reply((config) => [
      201,
      { ...SAMPLE_TRIP, body: JSON.parse(config.data as string) },
    ])

    const result = await createTrip({
      name: 'Tokyo 2026',
      destination: 'Tokyo, Japan',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
    })

    expect(result).toMatchObject({
      publicId: 'abc234def567',
      body: {
        name: 'Tokyo 2026',
        destination: 'Tokyo, Japan',
        startDate: '2026-05-01',
        endDate: '2026-05-05',
      },
    })
  })

  it('updates a trip', async () => {
    apiMock.onPatch('/trips/abc234def567').reply((config) => [
      200,
      { ...SAMPLE_TRIP, name: JSON.parse(config.data as string).name, version: 5 },
    ])

    await expect(
      updateTrip('abc234def567', { name: 'Tokyo and Kyoto', expectedVersion: 4 }),
    ).resolves.toMatchObject({ name: 'Tokyo and Kyoto', version: 5 })
    expect(JSON.parse(apiMock.history.patch[0].data as string)).toEqual({
      name: 'Tokyo and Kyoto',
      expectedVersion: 4,
    })
  })

  it('deletes a trip', async () => {
    apiMock.onDelete('/trips/abc234def567').reply(204)

    await expect(deleteTrip('abc234def567')).resolves.toBeUndefined()
  })
})
