import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from './client'
import {
  acceptGuestShareLink,
  acceptShareLink,
  createShareLink,
  listTripMembers,
  listShareLinks,
  revokeShareLink,
} from './share'
import type { CreatedShareLink, ShareLink } from '../types/share'

let apiMock: MockAdapter

const SHARE_LINK: ShareLink = {
  id: 12,
  role: 'EDITOR',
  allowAnonymous: false,
  createdAt: '2026-06-18T20:00:00Z',
  expiresAt: null,
  revokedAt: null,
}

const CREATED_LINK: CreatedShareLink = {
  ...SHARE_LINK,
  token: 'raw-token',
  shareUrl: 'http://localhost:3000/share/raw-token',
}

beforeEach(() => {
  apiMock = new MockAdapter(apiClient)
})

afterEach(() => {
  apiMock.restore()
})

describe('share api', () => {
  it('lists share links for a trip', async () => {
    apiMock.onGet('/trips/abc234def567/share-links').reply(200, [SHARE_LINK])

    await expect(listShareLinks('abc234def567')).resolves.toEqual([SHARE_LINK])
  })

  it('lists trip members', async () => {
    apiMock.onGet('/trips/abc234def567/members').reply(200, [
      {
        userId: 7,
        email: 'alice@example.com',
        displayName: 'Alice',
        role: 'OWNER',
      },
    ])

    await expect(listTripMembers('abc234def567')).resolves.toEqual([
      {
        userId: 7,
        email: 'alice@example.com',
        displayName: 'Alice',
        role: 'OWNER',
      },
    ])
  })

  it('creates a share link', async () => {
    apiMock.onPost('/trips/abc234def567/share-links').reply((config) => [
      201,
      { ...CREATED_LINK, body: JSON.parse(config.data as string) },
    ])

    await expect(
      createShareLink('abc234def567', {
        role: 'VIEWER',
        allowAnonymous: true,
        expiresAt: null,
      }),
    ).resolves.toMatchObject({
      shareUrl: CREATED_LINK.shareUrl,
      body: {
        role: 'VIEWER',
        allowAnonymous: true,
        expiresAt: null,
      },
    })
  })

  it('revokes a share link', async () => {
    apiMock.onDelete('/trips/abc234def567/share-links/12').reply(204)

    await expect(revokeShareLink('abc234def567', 12)).resolves.toBeUndefined()
  })

  it('accepts an account invite', async () => {
    apiMock.onPost('/share/raw-token/accept').reply(200, {
      publicId: 'abc234def567',
      role: 'EDITOR',
    })

    await expect(acceptShareLink('raw-token')).resolves.toEqual({
      publicId: 'abc234def567',
      role: 'EDITOR',
    })
  })

  it('accepts a guest invite', async () => {
    apiMock.onPost('/share/raw-token/guest').reply((config) => [
      200,
      {
        publicId: 'abc234def567',
        role: 'VIEWER',
        displayName: JSON.parse(config.data as string).displayName,
      },
    ])

    await expect(
      acceptGuestShareLink('raw-token', { displayName: 'Guest Alice' }),
    ).resolves.toEqual({
      publicId: 'abc234def567',
      role: 'VIEWER',
      displayName: 'Guest Alice',
    })
  })
})
