<template>
  <div class="border-t pt-4" data-testid="seedance-video-pricing">
    <label class="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
      <input type="checkbox" class="rounded" :checked="enabled" @change="toggle" />
      {{ t('admin.groups.videoPricing.seedanceEnable') }}
    </label>
    <div v-if="enabled" class="mt-3 space-y-4">
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.groups.videoPricing.seedanceHint') }}</p>
      <div class="space-y-2">
        <label v-for="row in rows" :key="row.model" class="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_9rem_8rem]">
          <span class="text-xs">
            <code class="font-mono">{{ row.model }}</code>
            <span class="block text-gray-700 dark:text-gray-300">{{ row.name }}</span>
            <span class="block text-gray-500 dark:text-gray-400">{{ row.resolution }} · {{ durationLabel(row) }} · {{ row.label }}</span>
          </span>
          <input type="number" class="input" min="0" step="any" :data-model="row.model" :placeholder="t('admin.groups.videoPricing.seedanceDisabled')" :value="tariff[row.model] ?? ''" @input="changePrice(row.model, $event)" />
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ t(row.perRequest ? 'admin.groups.videoPricing.seedancePerRequest' : 'admin.groups.videoPricing.seedancePerSecond') }}
            <span v-if="tariff[row.model] !== null && tariff[row.model] !== undefined && tariff[row.model] !== ''" class="block">→ {{ finalPriceFor(tariff[row.model]) }}</span>
          </span>
        </label>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.groups.videoPricing.seedanceMultiplier', { multiplier }) }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SEEDANCE_VIDEO_PRICE_FAMILY as family, SEEDANCE_VIDEO_TIERS, type SeedanceVideoTier } from '@/utils/seedanceVideo'
import type { VideoModelPricesForm } from './groupsVideoModelPricing'

// One USD price per catalog model: per second or per request as the upstream
// sells it. A blank model is not sold in this group.
const props = defineProps<{ modelValue: VideoModelPricesForm; multiplier: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: VideoModelPricesForm] }>()
const { t } = useI18n()
type Row = SeedanceVideoTier & { model: string }
const rows: Row[] = Object.entries(SEEDANCE_VIDEO_TIERS).map(([model, tier]) => ({ ...tier, model }))
const tariff = computed(() => props.modelValue[family] ?? {})
const enabled = computed(() => family in props.modelValue)

function durationLabel(row: Row) {
  if (row.allowedSeconds) return `${row.allowedSeconds.join('/')}s`
  return row.minSeconds === row.maxSeconds ? `${row.minSeconds}s` : `${row.minSeconds}–${row.maxSeconds}s`
}
function finalPriceFor(value: number | string | null | undefined) {
  return `$${(Number(value) * props.multiplier).toFixed(6)}`
}
function replace(next: Record<string, number | string | null> | undefined) {
  const form = { ...props.modelValue }
  delete form[family]
  if (next) form[family] = next
  emit('update:modelValue', form)
}
function toggle(event: Event) {
  replace((event.target as HTMLInputElement).checked ? {} : undefined)
}
function changePrice(model: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  // Keep intermediate decimal input such as "0." intact until serialization.
  replace({ ...tariff.value, [model]: raw === '' ? null : raw })
}
</script>
