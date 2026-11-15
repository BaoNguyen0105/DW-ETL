import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { cloneElement, type ReactElement } from 'react'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
// jsdom has no layout engine. Supply chart dimensions while retaining real chart rendering.
vi.mock('recharts', async (importOriginal) => {
  const charts = await importOriginal<typeof import('recharts')>()
  return {
    ...charts,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 640, height: 280 } as object),
  }
})
