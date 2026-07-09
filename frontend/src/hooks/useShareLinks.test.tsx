import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiClient } from '../api/client'
import type { ShareLink } from '../types/share'
import { shareKeys, useCreateShareLink } from './useShareLinks'

let apiMock: MockAdapter
let queryClient: QueryClient

const EXISTING_LINK: ShareLink = {
  id: 7,
  name: 'Old invite',
  role: 'EDITOR',
  allowAnonymous: false,
  createdAt: '2026-05-22T16:00:00Z',
  expiresAt: null,
  revokedAt: null,
  shareUrl: 'https://app.example.com/share/old-token',
}

const CREATED_LINK = {
  ...EXISTING_LINK,
  name: 'Fresh invite',
  allowAnonymous: true,
  token: 'fresh-token',
  shareUrl: 'https://app.example.com/share/fresh-token',
}

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

beforeEach(() => {
  apiMock = new MockAdapter(apiClient)
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
})

afterEach(() => {
  apiMock.restore()
  queryClient.clear()
})

describe('useShareLinks', () => {
  it('dedupes a created share link already present in cache', async () => {
    queryClient.setQueryData(shareKeys.forTrip('abc234def567'), [EXISTING_LINK])
    apiMock.onPost('/trips/abc234def567/share-links').reply(201, CREATED_LINK)

    const { result } = renderHook(() => useCreateShareLink(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        publicId: 'abc234def567',
        body: {
          role: 'EDITOR',
          allowAnonymous: true,
          expiresAt: null,
        },
      })
    })

    expect(queryClient.getQueryData(shareKeys.forTrip('abc234def567'))).toEqual([
      CREATED_LINK,
    ])
  })
})
