import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

describe('PDF dependencies', () => {
  test('given package.json, when read, then react-pdf is pinned to exactly 11.0.0', () => {
    expect(pkg.dependencies['react-pdf']).toBe('11.0.0')
  })

  test('given package.json, when read, then pdfjs-dist is never a direct dependency', () => {
    expect(pkg.dependencies['pdfjs-dist']).toBeUndefined()
    expect(pkg.devDependencies['pdfjs-dist']).toBeUndefined()
  })

  test('given node_modules, when resolving pdfjs-dist, then it is the 6.3.289 copy react-pdf pins', () => {
    const pdfjs = JSON.parse(readFileSync('node_modules/pdfjs-dist/package.json', 'utf8'))
    expect(pdfjs.version).toBe('6.3.289')
  })

  test('given node_modules, when looking for the worker, then pdf.worker.min.mjs exists', () => {
    expect(existsSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')).toBe(true)
  })
})

describe('voice dependencies', () => {
  test.each([
    ['@met4citizen/talkinghead', '1.8.2'],
    ['three', '0.186.1'],
    ['@met4citizen/headtts', '1.3.0'],
    ['@huggingface/transformers', '4.3.2']
  ])(
    'given package.json, when read, then %s is an exact %s devDependency only',
    (name, version) => {
      expect(pkg.devDependencies[name]).toBe(version)
      expect(pkg.dependencies[name]).toBeUndefined()
    }
  )
})
