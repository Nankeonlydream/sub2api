// Keep the full version as the deployment identity; shorten only its display.
export function formatVersion(version: string, customLabel: string): string {
  if (!version) return ''
  const custom = version.match(/^v?(\d+\.\d+\.\d+)-creator(?:[.+-]|$)/)
  return custom ? `v${custom[1]} ${customLabel}` : `v${version.replace(/^v/, '')}`
}
