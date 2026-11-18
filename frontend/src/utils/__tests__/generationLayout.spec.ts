import { describe, expect, it } from 'vitest'
import { pickGenerationColumns } from '../generationLayout'

describe('pickGenerationColumns', () => {
  it('keeps frames on one row while the stage is wide enough', () => {
    expect(pickGenerationColumns(4, 1713, 656, 1, 12)).toBe(4)
    expect(pickGenerationColumns(4, 1713, 656, 9 / 16, 12)).toBe(4)
    expect(pickGenerationColumns(2, 1302, 582, 1, 12)).toBe(2)
  })

  it('wraps onto more rows when that makes each frame larger', () => {
    expect(pickGenerationColumns(4, 700, 900, 1, 12)).toBe(2)
    expect(pickGenerationColumns(2, 1302, 582, 21 / 9, 12)).toBe(1)
    expect(pickGenerationColumns(9, 1200, 900, 1, 12)).toBe(3)
  })

  it('falls back to two columns before the stage has been measured', () => {
    expect(pickGenerationColumns(4, 0, 0, 1, 12)).toBe(2)
    expect(pickGenerationColumns(1, 0, 0, 1, 12)).toBe(1)
  })
})
