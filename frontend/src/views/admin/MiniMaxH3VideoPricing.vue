<template>
  <div class="border-t pt-4" data-testid="minimax-h3-video-pricing">
    <label class="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
      <input type="checkbox" class="rounded" :checked="enabled" @change="toggle" />
      {{ t('admin.groups.videoPricing.h3Enable') }}
    </label>
    <div v-if="enabled" class="mt-2">
      <button type="button" class="btn btn-secondary btn-sm" data-testid="minimax-catalog-open" @click="catalogOpen = true">
        {{ t('admin.groups.videoPricing.h3CatalogManage') }}
      </button>
      <span v-if="customized" class="ml-2 text-xs text-primary-600 dark:text-primary-400">{{ t('admin.groups.videoPricing.seedanceCatalogCustomized') }}</span>
    </div>
    <SeedanceCatalogEditor family="minimax" :show="catalogOpen" @close="catalogOpen = false" @saved="state => customized = state.customized" />
    <div v-if="enabled" class="mt-3 space-y-4">
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.groups.videoPricing.h3ModelHint') }}</p>
      <div class="space-y-2">
        <label v-for="row in rows" :key="row.model" class="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_9rem_8rem]">
          <span class="min-w-0 text-xs">
            <code class="font-mono">{{ row.model }}</code>
            <span class="block break-words text-gray-700 dark:text-gray-300">{{ row.name }}</span>
            <span class="block break-words text-gray-500 dark:text-gray-400">{{ miniMaxTierHint(row) }}</span>
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
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getMiniMaxCatalog } from '@/api/admin/miniMaxCatalog'
import { applyMiniMaxCatalog, miniMaxCatalogModels, miniMaxTierHint } from '@/utils/miniMaxH3'
import SeedanceCatalogEditor from './SeedanceCatalogEditor.vue'
import type { VideoModelPricesForm } from './groupsVideoModelPricing'

// One USD price per catalog model, per second or per request as the catalog
// says. A blank model is not sold in this group.
const props = defineProps<{ modelValue: VideoModelPricesForm; multiplier: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: VideoModelPricesForm] }>()
const { t } = useI18n()
const family = 'minimax-h3'
const customized = ref(false)
const catalogOpen = ref(false)
const rows = computed(() => miniMaxCatalogModels().map(([model, tier]) => ({ ...tier, model })))
const tariff = computed(() => props.modelValue[family] ?? {})
const enabled = computed(() => family in props.modelValue)

onMounted(async () => {
  try {
    const state = await getMiniMaxCatalog()
    applyMiniMaxCatalog(state)
    customized.value = state.customized
  } catch {
    // Keep showing the built-in catalog.
  }
})

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
  // Prices of models no longer in the catalog (e.g. retired DeepKey tiers) are dropped.
  replace((event.target as HTMLInputElement).checked ? {} : undefined)
}
function changePrice(model: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const next: Record<string, number | string | null> = {}
  // Keep only catalog models, so retired shared-tariff keys (768p, per_second…) go away on save.
  for (const row of rows.value) if (row.model in tariff.value) next[row.model] = tariff.value[row.model]
  // Keep intermediate decimal input such as "0." intact until serialization.
  next[model] = raw === '' ? null : raw
  replace(next)
}
</script>
