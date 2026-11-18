<template>
  <BaseDialog :show="show" :title="tc('title')" width="extra-wide" :z-index="70" @close="emit('close')">
    <div class="space-y-3" :data-testid="isMiniMax ? 'minimax-catalog-editor' : 'seedance-catalog-editor'">
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ tc('hint') }}</p>
      <div v-for="(row, index) in rows" :key="row.key" class="rounded-lg border border-gray-200 p-3 dark:border-dark-600" data-testid="seedance-catalog-row">
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label class="text-xs">{{ tc('model') }}
            <input v-model="row.model" class="input mt-1 font-mono" data-field="model" />
          </label>
          <label class="text-xs">{{ tc('name') }}
            <input v-model="row.name" class="input mt-1" maxlength="100" data-field="name" />
          </label>
          <label class="text-xs">{{ tc('note') }}
            <input v-model="row.note" class="input mt-1" maxlength="300" data-field="note" />
          </label>
        </div>
        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
          <label class="text-xs">{{ tc('resolution') }}
            <select v-model="row.resolution" class="input mt-1">
              <option v-for="r in resolutions" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>
          <label class="text-xs">{{ tc('billing') }}
            <select v-model="row.perRequest" class="input mt-1">
              <option :value="false">{{ tc('perSecond') }}</option>
              <option :value="true">{{ tc('perRequest') }}</option>
            </select>
          </label>
          <label class="text-xs">{{ tc('minSeconds') }}
            <input v-model.number="row.minSeconds" type="number" min="1" class="input mt-1" />
          </label>
          <label class="text-xs">{{ tc('maxSeconds') }}
            <input v-model.number="row.maxSeconds" type="number" min="1" class="input mt-1" />
          </label>
          <label class="text-xs sm:col-span-2">{{ tc('allowedSeconds') }}
            <input v-model="row.allowedText" class="input mt-1" placeholder="5, 10, 15" />
          </label>
        </div>
        <fieldset class="mt-2 text-xs" data-field="aspect-ratios">
          <legend>{{ tc('aspectRatios') }}</legend>
          <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <label v-for="ratio in aspectRatioOptions" :key="ratio" class="inline-flex items-center gap-1">
              <input v-model="row.aspectRatios" type="checkbox" :value="ratio" />{{ ratio }}
            </label>
          </div>
        </fieldset>
        <div class="mt-2 flex flex-wrap items-end justify-between gap-2">
          <label class="text-xs">{{ tc('referenceImages') }}
            <input v-model.number="row.maxReferenceImages" type="number" min="0" :max="isMiniMax ? 9 : 100" class="input mt-1 w-28" data-field="reference-images" />
          </label>
          <label v-if="isMiniMax" class="inline-flex items-center gap-1 text-xs">
            <input v-model="row.requiresReference" type="checkbox" data-field="requires-reference" />{{ tc('requiresReference') }}
          </label>
          <span class="flex gap-2">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="index === 0" @click="move(index, -1)">{{ tc('moveUp') }}</button>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="index === rows.length - 1" @click="move(index, 1)">{{ tc('moveDown') }}</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="remove" @click="rows.splice(index, 1)">{{ tc('remove') }}</button>
          </span>
        </div>
      </div>
      <p v-if="!rows.length" class="text-xs text-amber-600">{{ tc('empty') }}</p>
      <button type="button" class="btn btn-secondary btn-sm" data-action="add" @click="rows.push(blankRow())">{{ tc('add') }}</button>
    </div>
    <template #footer>
      <div class="flex justify-between gap-2">
        <button type="button" class="btn btn-secondary" :disabled="busy" data-action="reset" @click="reset">{{ tc('reset') }}</button>
        <button type="button" class="btn btn-primary" :disabled="busy || !rows.length" data-action="save" @click="save">
          {{ busy ? tc('saving') : tc('save') }}
        </button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { useAppStore } from '@/stores/app'
import { getSeedanceCatalog, resetSeedanceCatalog, saveSeedanceCatalog } from '@/api/admin/seedanceCatalog'
import { getMiniMaxCatalog, resetMiniMaxCatalog, saveMiniMaxCatalog } from '@/api/admin/miniMaxCatalog'
import {
  applyMiniMaxCatalog,
  builtinMiniMaxCatalogEntries,
  MINIMAX_H3_RESOLUTIONS,
  type MiniMaxCatalogEntry,
  type MiniMaxCatalogState,
} from '@/utils/miniMaxH3'
import {
  applySeedanceCatalog,
  builtinSeedanceCatalogEntries,
  SEEDANCE_CATALOG_ASPECT_RATIOS,
  type SeedanceCatalogEntry,
  type SeedanceCatalogState,
  type SeedanceVideoTier,
} from '@/utils/seedanceVideo'

// Edits the catalog of relay model IDs (Seedance, or MiniMax-H3 with
// family="minimax"). Saving replaces the whole list; the backend validates it
// again.
const props = defineProps<{ show: boolean; family?: 'seedance' | 'minimax' }>()
const emit = defineEmits<{ close: []; saved: [state: SeedanceCatalogState | MiniMaxCatalogState] }>()
const { t, te } = useI18n()
const appStore = useAppStore()
const isMiniMax = props.family === 'minimax'
type CatalogEntry = SeedanceCatalogEntry | MiniMaxCatalogEntry
type CatalogState = SeedanceCatalogState | MiniMaxCatalogState
// Functions are resolved on call, so partial API mocks in tests stay valid.
const api = isMiniMax
  ? {
      get: () => getMiniMaxCatalog(),
      save: (entries: CatalogEntry[]) => saveMiniMaxCatalog(entries as MiniMaxCatalogEntry[]),
      reset: () => resetMiniMaxCatalog(),
      apply: (state: CatalogState) => applyMiniMaxCatalog(state as MiniMaxCatalogState),
      builtin: (): CatalogEntry[] => builtinMiniMaxCatalogEntries(),
    }
  : {
      get: () => getSeedanceCatalog(),
      save: (entries: CatalogEntry[]) => saveSeedanceCatalog(entries as SeedanceCatalogEntry[]),
      reset: () => resetSeedanceCatalog(),
      apply: (state: CatalogState) => applySeedanceCatalog(state as SeedanceCatalogState),
      builtin: (): CatalogEntry[] => builtinSeedanceCatalogEntries(),
    }

// MiniMax reuses the Seedance strings except where it names the family.
function tc(key: string, params?: Record<string, unknown>) {
  const own = `admin.groups.videoPricing.h3Catalog.${key}`
  return t(isMiniMax && te(own) ? own : `admin.groups.videoPricing.seedanceCatalog.${key}`, params || {})
}

interface Row {
  key: number
  model: string
  name: string
  note: string
  resolution: string
  perRequest: boolean
  minSeconds: number
  maxSeconds: number
  allowedText: string
  maxReferenceImages: number
  requiresReference: boolean
  aspectRatios: string[]
}

// Shown when a model lists no ratios of its own.
const DEFAULT_ASPECT_RATIOS = ['16:9', '9:16', '1:1']
const aspectRatioOptions = SEEDANCE_CATALOG_ASPECT_RATIOS

const resolutions: string[] = isMiniMax ? MINIMAX_H3_RESOLUTIONS : ['480p', '720p', '1080p'] satisfies SeedanceVideoTier['resolution'][]
const rows = ref<Row[]>([])
const busy = ref(false)
let nextKey = 0

function blankRow(): Row {
  return { key: nextKey++, model: '', name: '', note: '', resolution: isMiniMax ? '768p' : '720p', perRequest: false, minSeconds: 5, maxSeconds: 15, allowedText: '', maxReferenceImages: 9, requiresReference: false, aspectRatios: [...DEFAULT_ASPECT_RATIOS] }
}

function rowFromEntry(entry: CatalogEntry): Row {
  return {
    key: nextKey++,
    model: entry.model,
    name: entry.name,
    note: entry.note,
    resolution: entry.resolution,
    perRequest: entry.per_request,
    minSeconds: entry.min_seconds,
    maxSeconds: entry.max_seconds,
    allowedText: (entry.allowed_seconds || []).join(', '),
    maxReferenceImages: entry.max_reference_images,
    requiresReference: 'requires_reference' in entry && entry.requires_reference,
    aspectRatios: entry.aspect_ratios?.length ? [...entry.aspect_ratios] : [...DEFAULT_ASPECT_RATIOS],
  }
}

function parseAllowed(text: string): number[] | null {
  const parts = text.split(/[\s,，、]+/).filter(Boolean)
  const numbers = parts.map(Number)
  return numbers.every(n => Number.isInteger(n) && n >= 1) ? numbers : null
}

function move(index: number, delta: -1 | 1) {
  const target = index + delta
  if (target < 0 || target >= rows.value.length) return
  const next = [...rows.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  rows.value = next
}

function messageOf(error: unknown): string {
  const e = error as { response?: { data?: { message?: string } }; message?: string }
  return e?.response?.data?.message || e?.message || ''
}

async function load() {
  busy.value = true
  try {
    const state = await api.get()
    rows.value = (state.customized && state.entries.length ? state.entries as CatalogEntry[] : api.builtin()).map(rowFromEntry)
  } catch (error) {
    rows.value = api.builtin().map(rowFromEntry)
    appStore.showError(messageOf(error) || tc('loadFailed'))
  } finally {
    busy.value = false
  }
}

async function save() {
  const entries: CatalogEntry[] = []
  for (const [index, row] of rows.value.entries()) {
    const allowed = row.allowedText.trim() ? parseAllowed(row.allowedText) : []
    if (!allowed) {
      appStore.showError(tc('invalidSeconds', { index: index + 1 }))
      return
    }
    if (!row.aspectRatios.length) {
      appStore.showError(tc('noAspectRatio', { index: index + 1 }))
      return
    }
    // Keep the editor's option order; the first ratio is Creator Studio's fallback.
    const ratios = aspectRatioOptions.filter(ratio => row.aspectRatios.includes(ratio))
    entries.push({
      model: row.model.trim(),
      name: row.name.trim(),
      note: row.note.trim(),
      resolution: row.resolution as SeedanceVideoTier['resolution'],
      min_seconds: Number(row.minSeconds) || 0,
      max_seconds: Number(row.maxSeconds) || 0,
      ...(allowed.length ? { allowed_seconds: allowed } : {}),
      per_request: row.perRequest,
      max_reference_images: Number(row.maxReferenceImages) || 0,
      ...(isMiniMax ? { requires_reference: row.requiresReference } : {}),
      ...(ratios.join() !== DEFAULT_ASPECT_RATIOS.join() ? { aspect_ratios: ratios } : {}),
    })
  }
  busy.value = true
  try {
    const state = await api.save(entries)
    api.apply(state)
    appStore.showSuccess(tc('saved'))
    emit('saved', state)
    emit('close')
  } catch (error) {
    appStore.showError(messageOf(error))
  } finally {
    busy.value = false
  }
}

async function reset() {
  if (!window.confirm(tc('resetConfirm'))) return
  busy.value = true
  try {
    const state = await api.reset()
    api.apply(state)
    appStore.showSuccess(tc('resetDone'))
    emit('saved', state)
    emit('close')
  } catch (error) {
    appStore.showError(messageOf(error))
  } finally {
    busy.value = false
  }
}

watch(() => props.show, show => { if (show) void load() })
</script>
