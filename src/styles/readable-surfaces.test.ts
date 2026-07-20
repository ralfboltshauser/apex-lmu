// @vitest-environment node
/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sharedStyles = readFileSync(resolve('src/styles.css'), 'utf8')
const readableStyles = readFileSync(resolve('src/styles/readable-surfaces.css'), 'utf8')

describe('readable race-engineering surfaces', () => {
  it('defines the semantic type scale with relative units', () => {
    for (const token of ['caption', 'field-label', 'body', 'card-title', 'tabular', 'primary-data']) {
      expect(sharedStyles).toMatch(new RegExp(`--type-${token}:\\s*[\\d.]+rem`))
    }
  })

  it('does not introduce fixed pixel font sizes in the readability layer', () => {
    expect(readableStyles).not.toMatch(/font(?:-size)?:[^;{}]*\b\d+(?:\.\d+)?px\b/)
  })

  it.each(['.live-instrument-strip', '.strategy-source-note', '.fuel-auto-card', '.nav-item', '.toast'])(
    'maps %s to the shared readability contract',
    (selector) => expect(readableStyles).toContain(selector),
  )
})
