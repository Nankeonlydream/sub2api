<template>
  <BaseDialog :show="show" :title="t('admin.groups.videoPricing.seedanceCatalog.title')" width="extra-wide" :z-index="70" @close="emit('close')">
    <div class="space-y-3" data-testid="seedance-catalog-editor">
      <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('admin.groups.videoPricing.seedanceCatalog.hint') }}</p>
      <div v-for="(row, index) in rows" :key="row.key" class="rounded-lg border border-gray-200 p-3 dark:border-dark-600" data-testid="seedance-catalog-row">
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label class="text-xs">{{ t('admin.groups.videoPricing.seedanceCatalog.model') }}
            <input v-model="row.model" class="input mt-1 font-mono" data-field="model" />
          </label>
          <label class="text-xs">{{ t('admin.groups.videoPricing.seedanceCatalog.name') }}
            <input v-model="row.name" class="input mt-1" maxlength="100" data-field="name" />
          </label>
          <label class="text-xs">{{ t('admin.groups.videoPricing.seedanceCatalog.note') }}
            <input v-model="row.note" class="input mt-1" maxlength="300" data-field="note" />
          </label>
        </div>
        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
          <label class="text-xs">{{ t('admin.groups.videoPricing.seedanceCatalog.resolution') }}
            <select v-model="row.resolution" class="input mt-1">
              <option v-for="r in resolutions" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>
          <label class="text-xs">{{ t('admin.groups.videoPricing.seedanceCatalog.billing') }}
            <select v-model="row.perRequest" class="input mt-1">
              <option :value="false">{{ t('admin.groups.videoPricing.seedanceCatalog.perSecond') }}</option>
              <option :value="true">{{ t('admin.groups.videoPricing.seedanceCatalog.perRequest') }}</option>
            </select>
          </label>
          <label class="text-xs">{{ t('admin.groups.videoPricing.seedanceCatalog.minSeconds') }}
            <input v-model.number="row.minSeconds" type="number" min="1" class="input mt-1" />
          </label>
          <label class="text-xs">{{ t('admin.groups.videoPricing.seedanceCatalog.maxSeconds') }}
            <input v-model.number="row.maxSeconds" type="number" min="1" class="input mt-1" />
          </label>
          <label class="text-xs sm:col-span-2">{{ t('admin.groups.videoPricing.seedanceCatalog.allowedSeconds') }}
            <input v-model="row.allowedText" class="input mt-1" placeholder="5, 10, 15" />
          </label>
        </div>
        <div class="mt-2 flex flex-wrap items-end justify-between gap-2">
          <label class="text-xs">{{ t('admin.groups.videoPricing.seedanceCatalog.referenceImages') }}
            <input v-model.number="row.maxReferenceImages" type="number" min="0" max="100" class="input mt-1 w-28" />
          </label>
          <span class="flex gap-2">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="index === 0" @click="move(index, -1)">{{ t('admin.groups.videoPricing.seedanceCatalog.moveUp') }}</button>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="index === rows.length - 1" @click="move(index, 1)">{{ t('admin.groups.videoPricing.seedanceCatalog.moveDown') }}</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="remove" @click="rows.splice(index, 1)">{{ t('admin.groups.videoPricing.seedanceCatalog.remove') }}</button>
          </span>
        </div>
      </div>
      <p v-if="!rows.length" class="text-xs text-amber-600">{{ t('admin.groups.videoPricing.seedanceCatalog.empty') }}</p>
      <button type="button" class="btn btn-secondary btn-sm" data-action="add" @click="rows.push(blankRow())">{{ t('admin.groups.videoPricing.seedanceCatalog.add') }}</button>
    </div>
    <template #footer>
      <div class="flex justify-between gap-2">
        <button type="button" class="btn btn-secondary" :disabled="busy" data-action="reset" @click="reset">{{ t('admin.groups.videoPricing.seedanceCatalog.reset') }}</button>
        <button type="button" class="btn btn-primary" :disabled="busy || !rows.length" data-action="save" @click="save">
          {{ busy ? t('admin.groups.videoPricing.seedanceCatalog.saving') : t('admin.groups.videoPricing.seedanceCatalog.save') }}
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
import {
  applySeedanceCatalog,
  builtinSeedanceCatalogEntries,
  type SeedanceCatalogEntry,
  type SeedanceCatalogState,
  type SeedanceVideoTier,
} from '@/utils/seedanceVideo'

// Edits the catalog of Seedance model IDs the relay sells. Saving replaces the
// whole list; the backend validates it again.
const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ close: []; saved: [state: SeedanceCatalogState] }>()
const { t } = useI18n()
const appStore = useAppStore()

interface Row {
  key: number
  model: string
  name: string
  note: string
  resolution: SeedanceVideoTier['resolution']
  perRequest: boolean
  minSeconds: number
  maxSeconds: number
  allowedText: string
  maxReferenceImages: number
}

const resolutions: SeedanceVideoTier['resolution'][] = ['480p', '720p', '1080p']
const rows = ref<Row[]>([])
const busy = ref(false)
let nextKey = 0

function blankRow(): Row {
  return { key: nextKey++, model: '', name: '', note: '', resolution: '720p', perRequest: false, minSeconds: 5, maxSeconds: 15, allowedText: '', maxReferenceImages: 9 }
}

function rowFromEntry(entry: SeedanceCatalogEntry): Row {
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
    const state = await getSeedanceCatalog()
    rows.value = (state.customized && state.entries.length ? state.entries : builtinSeedanceCatalogEntries()).map(rowFromEntry)
  } catch (error) {
    rows.value = builtinSeedanceCatalogEntries().map(rowFromEntry)
    appStore.showError(messageOf(error) || t('admin.groups.videoPricing.seedanceCatalog.loadFailed'))
  } finally {
    busy.value = false
  }
}

async function save() {
  const entries: SeedanceCatalogEntry[] = []
  for (const [index, row] of rows.value.entries()) {
    const allowed = row.allowedText.trim() ? parseAllowed(row.allowedText) : []
    if (!allowed) {
      appStore.showError(t('admin.groups.videoPricing.seedanceCatalog.invalidSeconds', { index: index + 1 }))
      return
    }
    entries.push({
      model: row.model.trim(),
      name: row.name.trim(),
      note: row.note.trim(),
      resolution: row.resolution,
      min_seconds: Number(row.minSeconds) || 0,
      max_seconds: Number(row.maxSeconds) || 0,
      ...(allowed.length ? { allowed_seconds: allowed } : {}),
      per_request: row.perRequest,
      max_reference_images: Number(row.maxReferenceImages) || 0,
    })
  }
  busy.value = true
  try {
    const state = await saveSeedanceCatalog(entries)
    applySeedanceCatalog(state)
    appStore.showSuccess(t('admin.groups.videoPricing.seedanceCatalog.saved'))
    emit('saved', state)
    emit('close')
  } catch (error) {
    appStore.showError(messageOf(error))
  } finally {
    busy.value = false
  }
}

async function reset() {
  if (!window.confirm(t('admin.groups.videoPricing.seedanceCatalog.resetConfirm'))) return
  busy.value = true
  try {
    const state = await resetSeedanceCatalog()
    applySeedanceCatalog(state)
    appStore.showSuccess(t('admin.groups.videoPricing.seedanceCatalog.resetDone'))
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
