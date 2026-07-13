import { describe, expect, it } from 'vitest'
import { viewGuides } from './GuideDrawer'

describe('progressive discovery guides', () => {
  it('covers every workspace with a useful flow and glossary', () => {
    expect(Object.keys(viewGuides).sort()).toEqual(['analyze', 'feedback', 'fuel', 'home', 'live', 'overlays', 'settings', 'setups', 'strategy'])
    for (const guide of Object.values(viewGuides)) {
      expect(guide.summary.length).toBeGreaterThan(40)
      expect(guide.steps).toHaveLength(3)
      expect(guide.terms.length).toBeGreaterThanOrEqual(2)
      expect(guide.outcome.length).toBeGreaterThan(20)
    }
  })
})
