<template>
  <div class="border-t pt-4" data-testid="seedance-video-pricing">
    <label class="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
      <input type="checkbox" class="rounded" :checked="enabled" @change="toggle" />
      {{ t('admin.groups.videoPricing.seedanceEnable') }}
    </label>
    <div v-if="enabled" class="mt-2">
      <button type="button" class="btn btn-secondary btn-sm" data-testid="seedance-catalog-open" @click="catalogOpen = true">
        {{ t('admin.groups.videoPricing.seedanceCatalogManage') }}
      </button>
      <span v-if="customized" class="ml-2 text-xs text-primary-600 dark:text-primary-400">{{ t('admin.groups.videoPricing.seedanceCatalogCustomized') }}</span>
    </div>
    <SeedanceCatalogEditor :show="catalogOpen" @close="catalogOpen = false" @saved="onCatalogSaved" />
    <div v-if="enabled" class="mt-3 space-y-4">
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.groups.videoPricing.seedanceHint') }}</p>
      <div class="space-y-2">
        <label v-for="row in rows" :key="row.model" class="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_9rem_8rem]">
          <span class="min-w-0 text-xs">
            <code class="font-mono">{{ row.model }}</code>
            <span class="block break-words text-gray-700 dark:text-gray-300">{{ row.note || row.name }}</span>
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
import { getSeedanceCatalog } from '@/api/admin/seedanceCatalog'
import { applySeedanceCatalog, isGrokRelayVideoModel, seedanceCatalogModels, SEEDANCE_VIDEO_PRICE_FAMILY as family, type SeedanceCatalogState, type SeedanceVideoTier } from '@/utils/seedanceVideo'
import SeedanceCatalogEditor from './SeedanceCatalogEditor.vue'
import type { VideoModelPricesForm } from './groupsVideoModelPricing'

// One USD price per catalog model: per second or per request as the upstream
// sells it. A blank model is not sold in this group. Grok groups (grokOnly)
// list only the relay Grok lines (e.g. heavy-grok-720p).
const props = defineProps<{ modelValue: VideoModelPricesForm; multiplier: number; grokOnly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: VideoModelPricesForm] }>()
const { t } = useI18n()
type Row = SeedanceVideoTier & { model: string }
// The saved catalog decides which models can be priced; until it loads (or
// when none is saved) the built-in catalog is shown.
const customized = ref(false)
const catalogOpen = ref(false)
const rows = computed<Row[]>(() => seedanceCatalogModels()
  .filter(([model]) => isGrokRelayVideoModel(model) === Boolean(props.grokOnly))
  .map(([model, tier]) => ({ ...tier, model })))
function onCatalogSaved(state: SeedanceCatalogState) {
  customized.value = state.customized
}
onMounted(async () => {
  try {
    const state = await getSeedanceCatalog()
    applySeedanceCatalog(state)
    customized.value = state.customized
  } catch {
    // Keep showing the built-in catalog.
  }
})
const tariff = computed(() => props.modelValue[family] ?? {})
const enabled = computed(() => family in props.modelValue)

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
