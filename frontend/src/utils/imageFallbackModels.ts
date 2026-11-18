// Orders the other image models of a group for automatic fallback after the
// selected model keeps failing. Closer models come first so a fallback
// result stays as near to the selected model as possible:
//   1. the same series (family and version, e.g. gpt-image-2.6-*);
//   2. the same upscale (超分) setting;
//   3. the nearest version;
//   4. the same variant (e.g. flare, sunburst);
//   5. the order of the model list.

const UPSCALE_TOKEN = /超分|upscal/i
const VERSION_TOKEN = /^v?(\d+(?:\.\d+)?)$/i

interface ImageModelParts {
  family: string
  version: number | null
  variant: string
  upscale: boolean
}

function imageModelParts(model: string): ImageModelParts {
  const tokens = model.trim().toLowerCase().split(/[-_\s]+/).filter(Boolean)
  const upscale = tokens.some(token => UPSCALE_TOKEN.test(token))
  const core = tokens.filter(token => !UPSCALE_TOKEN.test(token))
  const versionAt = core.findIndex(token => VERSION_TOKEN.test(token))
  if (versionAt < 0) {
    return { family: core[0] || '', version: null, variant: core.slice(1).join('-'), upscale }
  }
  return {
    family: core.slice(0, versionAt).join('-'),
    version: Number(core[versionAt].match(VERSION_TOKEN)![1]),
    variant: core.slice(versionAt + 1).join('-'),
    upscale,
  }
}

export function orderImageFallbackModels(selected: string, models: string[]): string[] {
  const target = imageModelParts(selected)
  return [...new Set(models)]
    .filter(model => model !== selected)
    .map((model, index) => {
      const parts = imageModelParts(model)
      const sameFamily = parts.family === target.family
      const distance = sameFamily && parts.version !== null && target.version !== null
        ? Math.abs(parts.version - target.version)
        : Number.POSITIVE_INFINITY
      const key = [
        sameFamily && parts.version === target.version ? 0 : 1,
        parts.upscale === target.upscale ? 0 : 1,
        distance,
        parts.variant === target.variant ? 0 : 1,
        index,
      ]
      return { model, key }
    })
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) {
        if (a.key[i] !== b.key[i]) return a.key[i] < b.key[i] ? -1 : 1
      }
      return 0
    })
    .map(entry => entry.model)
}
