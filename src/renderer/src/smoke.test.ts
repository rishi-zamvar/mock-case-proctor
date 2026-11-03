import { expect, test } from 'vitest'

test('given the renderer project, when a test runs, then jsdom provides a document', () => {
  expect(typeof document).toBe('object')
})
