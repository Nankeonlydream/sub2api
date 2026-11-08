export interface MiniMaxH3Tier {
  resolution: '768p' | '1440p'
  minSeconds: number
  maxSeconds: number
  allowedSeconds?: number[]
  // Display name; the ID stays the upstream/billing key.
  label: string
  // Compact selector name; the full label remains available in history and pricing.
  optionLabel?: string
  // Zhongheng tiers have their own group price (per request or per second)
  // instead of the shared tariff, and fewer aspect ratios.
  zhongheng?: boolean
  perRequest?: boolean
  aspectRatios?: string[]
  // The upstream fails prompt-only jobs, so text-to-video is not offered.
  requiresReference?: boolean
}

const ZHONGHENG_RATIOS = ['16:9', '9:16', '1:1']

// DeepKey minimax-h3 group (guide-minimax-h3-video, /api/pricing observed
// 2026-10-29). Matching is case-insensitive.
const MINIMAX_H3_TIERS: Record<string, MiniMaxH3Tier> = {
  'minimax-h3-768p-933-10s': { resolution: '768p', minSeconds: 10, maxSeconds: 10, label: 'H3 标清版 768p · 固定10秒' },
  'minimax-h3-768p-933-15s': { resolution: '768p', minSeconds: 15, maxSeconds: 15, label: 'H3 标清版 768p · 固定15秒' },
  'minimax-h3-768p-933-10s-15s': { resolution: '768p', minSeconds: 10, maxSeconds: 15, label: 'MiniMax H3 标清版 768p · 按秒 · 10–15秒 · 8种画幅', optionLabel: 'MiniMax H3 标清版 768p · 8种画幅' },
  'minimax-h3-933-1440p-10s': { resolution: '1440p', minSeconds: 10, maxSeconds: 10, label: 'H3 高清版 2K · 固定10秒' },
  'minimax-h3-933-1440p-15s': { resolution: '1440p', minSeconds: 15, maxSeconds: 15, label: 'H3 高清版 2K · 固定15秒' },
  'minimax-h3-933-1440p-10-15s': { resolution: '1440p', minSeconds: 10, maxSeconds: 15, label: 'MiniMax H3 高清版 2K · 按秒 · 10–15秒 · 8种画幅', optionLabel: 'MiniMax H3 高清版 2K · 8种画幅' },
  // Zhongheng /v1/models?include_capabilities=1 observed 2026-10-30.
  'xminimex-h3': { resolution: '1440p', minSeconds: 5, maxSeconds: 15, label: 'MiniMax H3 高清版 2K · 按秒 · 5–15秒 · 原生不卡脸', optionLabel: 'MiniMax H3 高清版 2K · 原生不卡脸', zhongheng: true, aspectRatios: ZHONGHENG_RATIOS },
  'minimaxh3-768': { resolution: '768p', minSeconds: 5, maxSeconds: 15, allowedSeconds: [5, 6, 7, 9, 10, 11, 12, 13, 14, 15], label: 'MiniMax H3 标清版 768p · 按条 · 5–15秒 · 需参考图 · 高速并发', optionLabel: 'MiniMax H3 标清版 768p · 高速并发', zhongheng: true, perRequest: true, aspectRatios: ZHONGHENG_RATIOS, requiresReference: true },
}

// Models priced one by one in the group tariff, for the admin form.
export const MINIMAX_H3_MODEL_PRICED_TIERS = Object.entries(MINIMAX_H3_TIERS)
  .filter(([, tier]) => tier.zhongheng)
  .map(([model, tier]) => ({ ...tier, model }))

export const MINIMAX_H3_MODELS = [
  'Minimax-H3-768p-933-10s',
  'Minimax-H3-768p-933-15s',
  'Minimax-H3-768p-933-10s-15s',
  'MiniMax-H3-933-1440p-10s',
  'MiniMax-H3-933-1440p-15s',
  'MiniMax-H3-933-1440p-10-15s',
]

// Creator Studio lists only the 10-15s tiers; the fixed 10s/15s IDs are the
// same model at the same per-second price, so they stay API-only.
export const MINIMAX_H3_STUDIO_MODELS = [
  'Minimax-H3-768p-933-10s-15s',
  'MiniMax-H3-933-1440p-10-15s',
]

export function isMiniMaxH3StudioModel(model: string): boolean {
  const tier = miniMaxH3Tier(model)
  return tier !== null && tier.minSeconds !== tier.maxSeconds
}

export const MINIMAX_H3_MAX_REFERENCE_IMAGES = 9
export const MINIMAX_H3_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '3:2', '2:3']

export function miniMaxH3Tier(model: string): MiniMaxH3Tier | null {
  return MINIMAX_H3_TIERS[model.trim().replace(/^models\//i, '').toLowerCase()] || null
}

export function isMiniMaxH3Model(model: string): boolean {
  return miniMaxH3Tier(model) !== null
}
