<template>
  <div class="space-y-3" data-testid="creator-update-panel">
    <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-800 dark:bg-blue-900/20">
      <p class="font-medium text-blue-800 dark:text-blue-200">{{ t('version.creator.title') }}</p>
      <p class="mt-1 text-blue-700 dark:text-blue-300">{{ t(status?.auto_deploy ? 'version.creator.deployHint' : 'version.creator.localHint') }}</p>
    </div>
    <p v-if="status?.state === 'disabled'" class="text-xs text-gray-500 dark:text-dark-400">
      {{ t('version.creator.disabled') }}
    </p>
    <div v-if="status" aria-live="polite" class="space-y-2 text-xs">
      <p v-if="status.state === 'running'" class="text-primary-600 dark:text-primary-400">
        {{ t('version.creator.stages.' + (status.stage || 'snapshot')) }}
      </p>
      <p v-if="status.state === 'ready'" class="text-green-700 dark:text-green-400">
        {{ t('version.creator.ready') }}
      </p>
      <p v-if="status.state === 'deployed'" class="text-green-700 dark:text-green-400">
        {{ t('version.creator.deployed') }}
      </p>
      <div v-if="status.state === 'rolled_back' || status.state === 'recovery_required'" role="alert" class="space-y-1 text-red-600 dark:text-red-400">
        <p>{{ t('version.creator.' + (status.state === 'rolled_back' ? 'rolledBack' : 'recoveryRequired')) }}</p>
        <p class="break-words">{{ status.message }}</p>
      </div>
      <div v-if="status.state === 'failed'" role="alert" class="space-y-1 text-red-600 dark:text-red-400">
        <p>{{ t('version.creator.failed') }}</p>
        <p class="break-words">{{ status.message }}</p>
        <ul v-if="status.conflicts?.length" class="list-inside list-disc break-all">
          <li v-for="file in status.conflicts" :key="file">{{ file }}</li>
        </ul>
      </div>
    </div>
    <details v-if="appStore.currentVersion" class="text-xs text-gray-500 dark:text-dark-400">
      <summary class="cursor-pointer">{{ t('version.creator.buildDetails') }}</summary>
      <dl class="mt-2 space-y-2">
        <div>
          <dt>{{ t('version.creator.fullVersion') }}</dt>
          <dd class="mt-1 break-all font-mono">{{ appStore.currentVersion }}</dd>
        </div>
        <div v-if="installedUpstreamCommit">
          <dt>{{ t('version.creator.mergedOfficialCommit') }}</dt>
          <dd class="mt-1">
            <a :href="`https://github.com/Wei-Shaw/sub2api/commit/${installedUpstreamCommit}`" target="_blank" rel="noopener noreferrer" class="font-mono text-primary-600 hover:underline dark:text-primary-400">{{ installedUpstreamCommit.slice(0, 7) }}</a>
          </dd>
        </div>
      </dl>
    </details>
    <p v-if="error" role="alert" class="break-words text-xs text-red-600 dark:text-red-400">{{ error }}</p>
    <button
      :disabled="busy || fetching || !status || ['disabled', 'running', 'recovery_required'].includes(status.state)"
      class="w-full rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
      @click="start"
    >
      {{ busy || status?.state === 'running' ? t('version.updating') : t(status?.auto_deploy ? 'version.creator.deployStart' : 'version.creator.start') }}
    </button>
    <button :disabled="busy || fetching" class="w-full text-xs text-gray-500 hover:text-gray-700 dark:text-dark-400" @click="refresh">
      {{ t('version.creator.refreshStatus') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCreatorUpdateStatus, performUpdate, type CreatorUpdateStatus } from '@/api/admin/system'
import { useAppStore } from '@/stores/app'

const { t } = useI18n()
const appStore = useAppStore()
const status = ref<CreatorUpdateStatus | null>(null)
// A pending or failed job's commit is not the code currently serving the site.
const installedUpstreamCommit = computed(() =>
  status.value?.state === 'deployed' && status.value.version === appStore.currentVersion
    ? status.value.upstream_commit : undefined
)
const busy = ref(false)
const error = ref('')
let disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
const fetching = ref(false)

function message(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string }
  return e.response?.data?.message || e.message || t('version.updateFailed')
}

function poll() {
  clearTimeout(timer)
  if (!disposed && status.value?.state === 'running') timer = setTimeout(refresh, 2000)
}

async function refresh() {
  if (fetching.value || disposed) return
  fetching.value = true
  try {
    status.value = await getCreatorUpdateStatus()
    error.value = ''
    // The server now serves the new asset bundle. Reload once when the open
    // page still belongs to the previous release, including after reopening.
    if (status.value.state === 'deployed' && status.value.version && appStore.currentVersion && status.value.version !== appStore.currentVersion) {
      window.location.reload()
    }
  } catch (err) {
    error.value = status.value?.state === 'running' && ['deploying', 'health_check', 'rolling_back'].includes(status.value.stage || '')
      ? t('version.creator.reconnecting') : message(err)
  } finally {
    fetching.value = false
    poll()
  }
}

async function start() {
  if (busy.value || fetching.value || !status.value || ['disabled', 'running', 'recovery_required'].includes(status.value.state)) return
  busy.value = true
  error.value = ''
  clearTimeout(timer)
  try {
    const result = await performUpdate()
    // Never treat dispatch as a completed update or ask to restart the service.
    status.value = result.job || await getCreatorUpdateStatus()
  } catch (err) {
    const startError = message(err)
    // A timeout may have happened after dispatch. Recover the active job before
    // offering another start, including after the browser loses its response.
    await refresh()
    error.value = startError
  } finally {
    busy.value = false
    poll()
  }
}

onMounted(refresh)
onBeforeUnmount(() => { disposed = true; clearTimeout(timer) })
</script>
