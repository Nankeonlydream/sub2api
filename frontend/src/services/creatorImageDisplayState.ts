// Remember successful displays across component remounts, without keeping image
// pixels or multi-megabyte data URLs alive. Data URL callers supply a work key.
const displayedImages = new Set<string>()
const MAX_ENTRIES = 256

export function hasDisplayedCreatorImage(key: string): boolean {
  return displayedImages.has(key)
}

export function rememberDisplayedCreatorImage(key: string): void {
  if (!key || key.length > 2048) return
  displayedImages.delete(key)
  displayedImages.add(key)
  if (displayedImages.size > MAX_ENTRIES) displayedImages.delete(displayedImages.values().next().value!)
}

export function forgetDisplayedCreatorImage(key: string): void {
  displayedImages.delete(key)
}
