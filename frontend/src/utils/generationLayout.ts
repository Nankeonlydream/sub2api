/**
 * Picks how many generation frames go in each row so every frame is as large as the stage allows.
 * Frames stay on one row while they fit and wrap only when that makes them bigger;
 * on a tie the fewer-column (more balanced) layout wins.
 */
export function pickGenerationColumns(count: number, width: number, height: number, ratio: number, gap: number): number {
  const total = Math.max(1, Math.floor(count))
  if (!(width > 0) || !(height > 0) || !(ratio > 0)) return Math.min(total, 2)
  let best = 1
  let bestWidth = -Infinity
  for (let columns = 1; columns <= total; columns++) {
    const rows = Math.ceil(total / columns)
    const frameWidth = Math.min((width - (columns - 1) * gap) / columns, ((height - (rows - 1) * gap) / rows) * ratio)
    if (frameWidth > bestWidth + 0.5) {
      best = columns
      bestWidth = frameWidth
    }
  }
  return best
}
