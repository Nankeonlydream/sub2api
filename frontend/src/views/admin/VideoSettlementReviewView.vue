<template>
  <AppLayout>
    <div class="space-y-4" data-testid="video-settlement-reviews">
      <div class="card p-4 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t('videoReview.title') }}</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ t('videoReview.hint') }}</p>
          </div>
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="load">
            {{ loading ? t('common.loading') : t('videoReview.refresh') }}
          </button>
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full min-w-[960px] text-left text-sm">
          <thead class="border-b border-gray-100 text-xs uppercase text-gray-500 dark:border-dark-700 dark:text-gray-400">
            <tr>
              <th class="px-4 py-3">{{ t('videoReview.task') }}</th>
              <th class="px-4 py-3">{{ t('videoReview.user') }}</th>
              <th class="px-4 py-3">{{ t('videoReview.spec') }}</th>
              <th class="px-4 py-3">{{ t('videoReview.reason') }}</th>
              <th class="px-4 py-3">{{ t('videoReview.time') }}</th>
              <th class="px-4 py-3 text-right">{{ t('videoReview.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!loading && items.length === 0">
              <td colspan="6" class="px-4 py-10 text-center text-gray-500 dark:text-gray-400">{{ t('videoReview.empty') }}</td>
            </tr>
            <tr v-for="item in items" :key="item.task_id + ':' + item.api_key_id" class="border-b border-gray-50 align-top dark:border-dark-800" data-testid="video-review-row">
              <td class="px-4 py-3">
                <span class="mb-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-dark-700">{{ item.kind === 'ark' ? 'Seedance Ark' : 'Grok' }}</span>
                <code class="block max-w-[260px] break-all font-mono text-xs">{{ item.submitting ? t('videoReview.noTaskId') : item.task_id }}</code>
                <span class="text-xs text-gray-500">{{ t('videoReview.accountKey', { account: item.account_id, key: item.api_key_id, group: item.group_id }) }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="block">{{ item.user_email || '#' + item.user_id }}</span>
                <span class="text-xs text-gray-500">#{{ item.user_id }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="block">{{ item.model || '-' }}</span>
                <span class="text-xs text-gray-500">{{ specText(item) }}</span>
              </td>
              <td class="max-w-[260px] break-words px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                {{ item.reason || '-' }}
                <span class="block text-gray-400">{{ t('videoReview.attempts', { n: item.attempts }) }}</span>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                <span class="block">{{ t('videoReview.created') }} {{ formatTime(item.created_at) }}</span>
                <span class="block">{{ t('videoReview.reviewed') }} {{ formatTime(item.reviewed_at) }}</span>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-right">
                <div class="flex justify-end gap-2">
                  <button v-if="!item.submitting" type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="open(item, 'retry')">{{ t('videoReview.retry') }}</button>
                  <button v-if="!item.submitting" type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="open(item, 'charge')">{{ t('videoReview.charge') }}</button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="open(item, 'dismiss')">{{ t('videoReview.dismiss') }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Pagination v-if="total > 0" :total="total" :page="page" :page-size="pageSize" @update:page="changePage" @update:page-size="changePageSize" />
    </div>

    <BaseDialog :show="!!target" :title="dialogTitle" width="narrow" @close="close">
      <div v-if="target" class="space-y-3 py-2 text-sm">
        <p class="text-gray-600 dark:text-gray-300">{{ dialogMessage }}</p>
        <label v-if="action === 'charge' && target.kind === 'ark'" class="block">
          <span class="input-label">{{ t('videoReview.tokens') }}</span>
          <input v-model.number="tokens" type="number" min="1" step="1" class="input" data-testid="video-review-tokens" />
          <span class="mt-1 block text-xs text-gray-500">{{ t('videoReview.tokensHint') }}</span>
        </label>
        <label v-if="action === 'dismiss'" class="block">
          <span class="input-label">{{ t('videoReview.dismissReason') }}</span>
          <input v-model.trim="reason" type="text" maxlength="300" class="input" />
        </label>
      </div>
      <template #footer>
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="close">{{ t('common.cancel') }}</button>
        <button type="button" :class="['btn', action === 'dismiss' ? 'btn-danger' : 'btn-primary']" :disabled="busy || !canSubmit" data-testid="video-review-confirm" @click="submit">
          {{ busy ? t('common.loading') : t('common.confirm') }}
        </button>
      </template>
    </BaseDialog>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Pagination from '@/components/common/Pagination.vue'
import { useAppStore } from '@/stores'
import { useVideoSettlementReviewStore } from '@/stores/videoSettlementReviews'
import {
  actOnVideoSettlementReview,
  listVideoSettlementReviews,
  type VideoSettlementReview
} from '@/api/admin/videoSettlementReviews'

type Action = 'retry' | 'charge' | 'dismiss'

const { t } = useI18n()
const appStore = useAppStore()
const reviewStore = useVideoSettlementReviewStore()

const items = ref<VideoSettlementReview[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const busy = ref(false)
const target = ref<VideoSettlementReview | null>(null)
const action = ref<Action>('retry')
const tokens = ref<number | null>(null)
const reason = ref('')

const canSubmit = computed(() => {
  if (action.value !== 'charge' || target.value?.kind !== 'ark') return true
  return Number.isInteger(tokens.value) && (tokens.value ?? 0) > 0
})
const dialogTitle = computed(() => t(`videoReview.${action.value}`))
const dialogMessage = computed(() => {
  const item = target.value
  if (!item) return ''
  if (action.value === 'charge') {
    return item.kind === 'ark' ? t('videoReview.chargeArk') : t('videoReview.chargeGrok', { spec: specText(item) })
  }
  return t(`videoReview.${action.value}Confirm`)
})

function specText(item: VideoSettlementReview) {
  const parts = [item.video_resolution, item.video_duration_seconds > 0 ? `${item.video_duration_seconds}s` : ''].filter(Boolean)
  return parts.length ? parts.join(' × ') : item.kind === 'ark' ? t('videoReview.byTokens') : '-'
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

async function load() {
  loading.value = true
  try {
    const res = await listVideoSettlementReviews(page.value, pageSize.value)
    items.value = res.items ?? []
    total.value = res.total ?? 0
    reviewStore.setPending(total.value)
    if (items.value.length === 0 && page.value > 1) {
      page.value -= 1
      await load()
    }
  } catch (err: any) {
    appStore.showError(err?.message || t('videoReview.loadFailed'))
  } finally {
    loading.value = false
  }
}

function changePage(next: number) {
  page.value = next
  void load()
}

function changePageSize(next: number) {
  pageSize.value = next
  page.value = 1
  void load()
}

function open(item: VideoSettlementReview, next: Action) {
  target.value = item
  action.value = next
  tokens.value = null
  reason.value = ''
}

function close() {
  if (!busy.value) target.value = null
}

async function submit() {
  const item = target.value
  if (!item || !canSubmit.value) return
  busy.value = true
  try {
    const payload =
      action.value === 'charge'
        ? { action: 'charge' as const, output_tokens: item.kind === 'ark' ? tokens.value ?? 0 : undefined }
        : action.value === 'dismiss'
          ? { action: 'dismiss' as const, reason: reason.value }
          : { action: 'retry' as const }
    const res = await actOnVideoSettlementReview(item, payload)
    appStore.showSuccess(t(`videoReview.result.${res.state}`))
    target.value = null
    await load()
  } catch (err: any) {
    appStore.showError(err?.message || t('videoReview.actionFailed'))
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>
