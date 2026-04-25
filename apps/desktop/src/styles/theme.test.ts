import styles from './index.css?raw'
import { describe, expect, it } from 'vitest'

describe('workbench theme styles', () => {
  it('themes the activity bar for light mode', () => {
    expect(styles).toContain(":root[data-theme='light']")
    expect(styles).toMatch(/--activity-bg:\s*#f3f3f3;/)
    expect(styles).toMatch(/--activity-text:\s*#616161;/)
    expect(styles).toMatch(/--activity-hover-bg:\s*rgba\(0,\s*0,\s*0,\s*0\.05\);/)
    expect(styles).toMatch(/background:\s*var\(--activity-bg\);/)
  })
})
