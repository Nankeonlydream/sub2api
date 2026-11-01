<template>
  <div class="creator-image" :class="{ 'is-preview': preview }" :aria-busy="state === 'loading'">
    <component :is="preview ? 'div' : 'button'" :type="preview ? undefined : 'button'" class="creator-image-open" :disabled="preview ? undefined : state !== 'ready'" :aria-label="alt" @click="!preview && $emit('preview')">
      <!-- The card's downscaled copy is already decoded, so it paints at once while the original decodes. -->
      <img v-if="placeholderSrc && state !== 'ready'" class="creator-image-placeholder" :src="placeholderSrc" alt="" aria-hidden="true" />
      <img
        v-if="displaySrc"
        :key="attempt"
        :data-attempt="attempt"
        :crossorigin="crossOrigin"
        :src="displaySrc"
        :alt="alt"
        decoding="async"
        :class="{ 'is-ready': state === 'ready', 'was-displayed': wasDisplayed || Boolean(placeholderSrc) }"
        @load="loaded"
        @error="failed"
        @click="preview && keepPreviewOpen($event)"
      />
    </component>
    <div v-if="state === 'loading' && !placeholderSrc" class="creator-image-skeleton" :class="{ 'is-delayed': wasDisplayed }" role="status" aria-live="polite">
      <span class="creator-image-sr-only">正在加载图片</span>
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
import { forgetCreatorDisplayImage, getCreatorDisplayImage, peekCreatorDisplayImage } from '@/services/creatorDisplayImage'
import { getCreatorImageObjectUrl } from '@/services/creatorImageBlobs'

// downscale: show a cached, card-sized copy of large data URLs (needs cacheKey).
const props = defineProps<{ src: string; alt: string; preview?: boolean; cacheKey?: string; downscale?: boolean }>()
defineEmits<{ preview: [] }>()
// Isolated pages (including the Vite dev server) block no-CORS CDN images
// without a CORP header. Match thumbnail requests there; keep ordinary image
// loading on non-isolated pages so CDNs without CORS remain supported.
const crossOrigin = typeof window !== 'undefined' && window.crossOriginIsolated ? 'anonymous' : undefined
const state = ref<'loading' | 'ready' | 'error'>('loading')
const displayKey = () => props.cacheKey || props.src
// Remembering a display does not mean the browser still has decoded pixels.
// Cache hits fade their feedback in after a CSS delay instead of a JS timer:
// decoding several large images can block timers, leaving some cards blank.
const wasDisplayed = ref(hasDisplayedCreatorImage(displayKey()))
const attempt = ref(0)
const displaySrc = ref('')
const placeholderSrc = ref('')
let version = 0

function resolveDisplaySource() {
  placeholderSrc.value = props.preview && props.cacheKey ? peekCreatorDisplayImage(props.cacheKey) : ''
  if (!props.downscale || !props.cacheKey || !props.src.startsWith('data:')) {
    // A short blob URL for a known original avoids parsing a multi-megabyte
    // src attribute on the main thread (full-size preview). It is shared, so
    // reopening a preview can reuse the browser's decoded image.
    displaySrc.value = getCreatorImageObjectUrl(props.src) || props.src
    return
  }
  displaySrc.value = ''
  const current = version
  const source = props.src
  void getCreatorDisplayImage(props.cacheKey, source).then(url => {
    if (current === version && props.src === source) displaySrc.value = url || source
  })
}

resolveDisplaySource()

function retry() {
  forgetDisplayedCreatorImage(displayKey())
  if (props.cacheKey) forgetCreatorDisplayImage(props.cacheKey)
  reset()
}

function reset() {
  version++
  wasDisplayed.value = hasDisplayedCreatorImage(displayKey())
  state.value = 'loading'
  attempt.value++
  resolveDisplaySource()
}

watch([() => props.src, () => props.cacheKey], reset, { flush: 'sync' })
onBeforeUnmount(() => {
  version++
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
      state.value = 'ready'
    }
  } catch {
    if (current === version) markFailed()
  }
}

// The preview image fills its box (object-fit: contain) so every image renders
// at the same size regardless of its pixels; clicks on the letterbox still close.
function keepPreviewOpen(event: MouseEvent) {
  const image = event.currentTarget as HTMLImageElement
  const rect = image.getBoundingClientRect()
  const { naturalWidth, naturalHeight } = image
  if (naturalWidth && naturalHeight) {
    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight)
    const x = Math.abs(event.clientX - rect.left - rect.width / 2)
    const y = Math.abs(event.clientY - rect.top - rect.height / 2)
    if (x > (naturalWidth * scale) / 2 || y > (naturalHeight * scale) / 2) return
  }
  event.stopPropagation()
}

function failed(event: Event) {
  if (Number((event.target as HTMLImageElement).dataset.attempt) === attempt.value) {
    markFailed()
  }
}

function markFailed() {
  version++
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
/* Both the card copy and the original fill the whole box with contain, so the
   preview never depends on intrinsic pixels and cannot jump between sizes. */
.is-preview .creator-image-open img { position: absolute; inset: 0; pointer-events: auto; }
.is-preview .creator-image-open .creator-image-placeholder { opacity: 1; pointer-events: none; }
.is-preview .creator-image-retry { pointer-events: auto; }
.creator-image-feedback { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 20px; color: var(--creator-image-text, #617d78); text-align: center; font-size: 12px; }
.creator-image-feedback strong { color: var(--creator-image-text, #28796d); font-size: 14px; }
/* Skeleton: the tint breathes while a light band sweeps across, so it reads as loading without text. */
.creator-image-skeleton { position: absolute; inset: 0; overflow: hidden; pointer-events: none; animation: creator-image-pulse 1.6s ease-in-out infinite; }
.creator-image-skeleton::before { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, var(--creator-image-shimmer, rgba(255, 255, 255, 0.85)) 50%, transparent 80%); transform: translateX(-100%); animation: creator-image-shimmer 1.4s ease-in-out infinite; }
/* Visibility and the pulse are separate properties, so both animations apply. */
.creator-image-skeleton.is-delayed { visibility: hidden; animation: creator-image-pulse 1.6s ease-in-out infinite, creator-image-reveal 0s linear 150ms forwards; }
.creator-image-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.creator-image-retry { border: 1px solid #8ac7bb; border-radius: var(--creator-radius, 12px); padding: 7px 16px; color: var(--creator-image-text, #28796d); }
@keyframes creator-image-shimmer { to { transform: translateX(100%); } }
@keyframes creator-image-pulse { 0%, 100% { background-color: transparent; } 50% { background-color: var(--creator-image-pulse, rgba(20, 158, 140, 0.08)); } }
@keyframes creator-image-reveal { to { visibility: visible; } }
/* Reduced motion keeps only the gentle color pulse, no sweeping movement. */
@media (prefers-reduced-motion: reduce) { .creator-image-skeleton::before { display: none; } .creator-image-open img { transition: none; } }
:global(.dark) .creator-image { background: var(--creator-image-background, #172b27); }
:global(.dark) .creator-image-skeleton { --creator-image-shimmer: rgba(255, 255, 255, 0.08); --creator-image-pulse: rgba(131, 221, 208, 0.06); }
:global(.dark) .creator-image-feedback { color: var(--creator-image-text, #a5bdb6); }
:global(.dark) .creator-image-feedback strong, :global(.dark) .creator-image-retry { color: var(--creator-image-text, #83ddd0); }
</style>
