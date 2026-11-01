<template>
  <div class="border-t pt-4" data-testid="minimax-h3-video-pricing">
    <label class="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
      <input type="checkbox" class="rounded" :checked="enabled" @change="toggle" />
      {{ t('admin.groups.videoPricing.h3Enable') }}
    </label>
    <div v-if="enabled" class="mt-3 space-y-3">
      <label class="block">
        <span class="input-label">{{ t('admin.groups.videoPricing.h3Mode') }}</span>
        <select class="input" :value="mode" @change="changeMode">
          <option value="per_resolution">{{ t('admin.groups.videoPricing.h3PerResolution') }}</option>
          <option value="per_second">{{ t('admin.groups.videoPricing.h3PerSecond') }}</option>
          <option value="per_request">{{ t('admin.groups.videoPricing.h3PerRequest') }}</option>
        </select>
      </label>
      <template v-if="mode === 'per_resolution'">
        <label v-for="resolution in resolutions" :key="resolution" class="block">
          <span class="input-label">{{ t('admin.groups.videoPricing.h3ResolutionPrice', { resolution }) }}</span>
          <input type="number" class="input" min="0" step="any" :data-resolution="resolution" :value="tariff[resolution] ?? ''" @input="changeResolutionPrice(resolution, $event)" />
        </label>
        <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.groups.videoPricing.h3ResolutionHint') }}</p>
        <p class="rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-800">
          <span v-for="resolution in resolutions" :key="resolution" class="block">
            {{ resolution }} · {{ t('admin.groups.videoPricing.h3Preview', { multiplier, price: finalPriceFor(tariff[resolution]) }) }}
            {{ t('admin.groups.videoPricing.h3PerSecond') }}
          </span>
        </p>
      </template>
      <template v-else>
      <label v-if="mode === 'per_request'" class="block">
        <span class="input-label">{{ t('admin.groups.videoPricing.h3Seconds') }}</span>
        <input type="number" class="input" min="1" max="15" step="1" required :value="seconds" @input="changeSeconds" />
      </label>
      <label class="block">
        <span class="input-label">{{ t(mode === 'per_second' ? 'admin.groups.videoPricing.h3SecondPrice' : 'admin.groups.videoPricing.h3RequestPrice') }}</span>
        <input type="number" class="input" min="0" step="any" required :value="price ?? ''" @input="changePrice" />
      </label>
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.groups.videoPricing.h3Hint') }}</p>
      <p v-if="mode === 'per_request'" class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.groups.videoPricing.h3DurationHint') }}</p>
      <p class="rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-800">
        {{ t('admin.groups.videoPricing.h3Preview', { multiplier, price: finalPrice }) }}
        {{ t(mode === 'per_second' ? 'admin.groups.videoPricing.h3PerSecond' : 'admin.groups.videoPricing.h3PerRequest') }}
      </p>
      </template>
      <div class="space-y-2 border-t border-dashed border-gray-200 pt-3 dark:border-dark-700">
        <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.groups.videoPricing.h3ModelHint') }}</p>
        <label v-for="row in modelRows" :key="row.model" class="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_9rem_8rem]">
          <span class="text-xs">
            <code class="font-mono">{{ row.model }}</code>
            <span class="block text-gray-500 dark:text-gray-400">{{ row.label }}</span>
          </span>
          <input type="number" class="input" min="0" step="any" :data-model="row.model" :placeholder="t('admin.groups.videoPricing.seedanceDisabled')" :value="tariff[row.model] ?? ''" @input="changeModelPrice(row.model, $event)" />
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ t(row.perRequest ? 'admin.groups.videoPricing.seedancePerRequest' : 'admin.groups.videoPricing.seedancePerSecond') }}
            <span v-if="tariff[row.model] !== null && tariff[row.model] !== undefined && tariff[row.model] !== ''" class="block">→ {{ finalPriceFor(tariff[row.model]) }}</span>
          </span>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MINIMAX_H3_MODEL_PRICED_TIERS as modelRows } from '@/utils/miniMaxH3'
import type { VideoModelPricesForm } from './groupsVideoModelPricing'

const props = defineProps<{ modelValue: VideoModelPricesForm; multiplier: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: VideoModelPricesForm] }>()
const { t } = useI18n()
const family = 'minimax-h3'
// DeepKey sells H3 at 768p and 1440p; these keys hold USD/s per resolution.
const resolutions = ['768p', '1440p'] as const
const tariff = computed(() => props.modelValue[family] ?? {})
const tariffKey = computed(() => Object.keys(tariff.value).find(key => key === 'per_second' || /^request_\d+s$/.test(key)))
const hasResolutionPrices = computed(() => resolutions.some(resolution => resolution in tariff.value))
// Zhongheng models keep their own prices whatever the shared tariff mode.
const modelPrices = computed(() => Object.fromEntries(modelRows.filter(row => row.model in tariff.value).map(row => [row.model, tariff.value[row.model]])))
const enabled = computed(() => tariffKey.value !== undefined || hasResolutionPrices.value || Object.keys(modelPrices.value).length > 0)
const mode = computed(() => hasResolutionPrices.value ? 'per_resolution' : tariffKey.value?.startsWith('request_') ? 'per_request' : 'per_second')
const seconds = computed(() => Number(tariffKey.value?.match(/^request_(\d+)s$/)?.[1] ?? 1))
const price = computed(() => tariffKey.value ? tariff.value[tariffKey.value] : null)
const finalPrice = computed(() => finalPriceFor(price.value))

function finalPriceFor(value: number | string | null | undefined) {
  return value === null || value === undefined || value === '' ? t('admin.groups.videoPricing.notConfigured') : `$${(Number(value) * props.multiplier).toFixed(6)}`
}
// Replace the shared tariff; model prices stay unless the family is turned off.
function replace(next: Record<string, number | string | null> | undefined) {
  const form = { ...props.modelValue }
  delete form[family]
  if (next) form[family] = { ...next, ...modelPrices.value }
  emit('update:modelValue', form)
}
function update(key?: string, value: number | string | null = null) {
  replace(key ? { [key]: value } : {})
}
function toggle(event: Event) {
  replace((event.target as HTMLInputElement).checked ? { '768p': null, '1440p': null } : undefined)
}
function changeMode(event: Event) {
  const next = (event.target as HTMLSelectElement).value
  if (next === 'per_resolution') {
    const current = mode.value === 'per_second' ? price.value ?? null : null
    replace({ '768p': current, '1440p': current })
    return
  }
  const carried = mode.value === 'per_resolution' ? tariff.value['768p'] ?? null : price.value ?? null
  update(next === 'per_request' ? `request_${seconds.value}s` : 'per_second', carried)
}
function changeSeconds(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isInteger(value) && value >= 1 && value <= 15) update(`request_${value}s`, price.value ?? null)
}
function changePrice(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  // Keep intermediate decimal input such as "0." intact until serialization.
  update(tariffKey.value ?? 'per_second', raw === '' ? null : raw)
}
function changeModelPrice(model: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  emit('update:modelValue', { ...props.modelValue, [family]: { ...tariff.value, [model]: raw === '' ? null : raw } })
}
function changeResolutionPrice(resolution: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const next: Record<string, number | string | null> = {}
  for (const key of resolutions) next[key] = tariff.value[key] ?? null
  next[resolution] = raw === '' ? null : raw
  replace(next)
}
</script>
