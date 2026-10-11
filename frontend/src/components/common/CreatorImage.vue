<template>
  <div class="creator-image" :class="{ 'is-preview': preview }" :aria-busy="state === 'loading'">
    <component :is="preview ? 'div' : 'button'" :type="preview ? undefined : 'button'" class="creator-image-open" :disabled="preview ? undefined : state !== 'ready'" :aria-label="alt" @click="!preview && $emit('preview')">
      <img
        :key="attempt"
        :data-attempt="attempt"
        :crossorigin="crossOrigin"
        :src="src"
        :alt="alt"
        decoding="async"
        :class="{ 'is-ready': state === 'ready', 'was-displayed': wasDisplayed }"
        @load="loaded"
        @error="failed"
        @click="preview && $event.stopPropagation()"
      />
    </component>
    <div v-if="state === 'loading' && showLoadingFeedback" class="creator-image-feedback" role="status" aria-live="polite">
      <span class="creator-image-spinner" aria-hidden="true"></span>
      <strong>正在加载图片</strong>
      <span>大图加载需要一点时间，请稍候</span>
    </div>
    <div v-else-if="state === 'error'" class="creator-image-feedback" role="alert">
      <strong>图片加载失败</strong>
      <button type="button" class="creator-image-retry" @click.stop="retry">重新加载</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { forgetDisplayedCreatorImage, hasDisplayedCreatorImage, rememberDisplayedCreatorImage } from '@/services/creatorImageDisplayState'

const props = defineProps<{ src: string; alt: string; preview?: boolean; cacheKey?: string }>()
defineEmits<{ preview: [] }>()
// Isolated pages (including the Vite dev server) block no-CORS CDN images
// without a CORP header. Match thumbnail requests there; keep ordinary image
// loading on non-isolated pages so CDNs without CORS remain supported.
const crossOrigin = typeof window !== 'undefined' && window.crossOriginIsolated ? 'anonymous' : undefined
const state = ref<'loading' | 'ready' | 'error'>('loading')
const displayKey = () => props.cacheKey || props.src
const wasDisplayed = ref(hasDisplayedCreatorImage(displayKey()))
const showLoadingFeedback = ref(!wasDisplayed.value)
const attempt = ref(0)
let version = 0
let loadingTimer: ReturnType<typeof setTimeout> | undefined

function clearLoadingTimer() {
  if (loadingTimer !== undefined) clearTimeout(loadingTimer)
  loadingTimer = undefined
}

function scheduleLoadingFeedback() {
  clearLoadingTimer()
  showLoadingFeedback.value = !wasDisplayed.value
  if (!wasDisplayed.value) return
  const current = version
  // Remembering a display does not mean the browser still has decoded pixels.
  // Give cache hits time to paint without a flash, but explain slower reloads.
  loadingTimer = setTimeout(() => {
    loadingTimer = undefined
    if (current === version && state.value === 'loading') showLoadingFeedback.value = true
  }, 150)
}

scheduleLoadingFeedback()

function retry() {
  forgetDisplayedCreatorImage(displayKey())
  reset()
}

function reset() {
  version++
  wasDisplayed.value = hasDisplayedCreatorImage(displayKey())
  state.value = 'loading'
  attempt.value++
  scheduleLoadingFeedback()
}

watch([() => props.src, () => props.cacheKey], reset, { flush: 'sync' })
onBeforeUnmount(() => {
  version++
  clearLoadingTimer()
})

async function loaded(event: Event) {
  const current = version
  const image = event.target as HTMLImageElement
  if (Number(image.dataset.attempt) !== attempt.value) return
  try {
    // The load event can precede decoding a large image. Keep the placeholder
    // until the browser can paint it, and ignore an earlier selection finishing.
    if (image.decode) await image.decode()
    if (current === version) {
      rememberDisplayedCreatorImage(displayKey())
      clearLoadingTimer()
      state.value = 'ready'
    }
  } catch {
    if (current === version) markFailed()
  }
}

function failed(event: Event) {
  if (Number((event.target as HTMLImageElement).dataset.attempt) === attempt.value) {
    markFailed()
  }
}

function markFailed() {
  version++
  clearLoadingTimer()
  forgetDisplayedCreatorImage(displayKey())
  wasDisplayed.value = false
  state.value = 'error'
}
</script>

<style scoped>
.creator-image { position: relative; overflow: hidden; background: var(--creator-image-background, #e8f0ee); }
.creator-image-open { position: absolute; inset: 0; width: 100%; height: 100%; }
.creator-image-open img { display: block; width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity 200ms ease; }
.creator-image-open img.is-ready { opacity: 1; }
.creator-image-open img.was-displayed { transition: none; }
.is-preview { pointer-events: none; }
.is-preview .creator-image-open { display: flex; align-items: center; justify-content: center; }
.is-preview .creator-image-open img { width: auto; height: auto; max-width: 100%; max-height: 100%; pointer-events: auto; }
.is-preview .creator-image-retry { pointer-events: auto; }
.creator-image-feedback { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 20px; color: var(--creator-image-text, #617d78); text-align: center; font-size: 12px; }
.creator-image-feedback strong { color: var(--creator-image-text, #28796d); font-size: 14px; }
.creator-image-spinner { width: 30px; height: 30px; border: 3px solid #c9e2dc; border-top-color: #149e8c; border-radius: 50%; animation: creator-image-spin 900ms linear infinite; }
.creator-image-retry { border: 1px solid #8ac7bb; border-radius: 8px; padding: 7px 16px; color: var(--creator-image-text, #28796d); }
@keyframes creator-image-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .creator-image-spinner { animation: none; } .creator-image-open img { transition: none; } }
:global(.dark) .creator-image { background: var(--creator-image-background, #172b27); }
:global(.dark) .creator-image-feedback { color: var(--creator-image-text, #a5bdb6); }
:global(.dark) .creator-image-feedback strong, :global(.dark) .creator-image-retry { color: var(--creator-image-text, #83ddd0); }
</style>
