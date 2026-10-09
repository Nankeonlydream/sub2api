<template>
  <span ref="element" class="creator-thumbnail" :aria-busy="state === 'loading'">
    <span v-if="state !== 'ready'" class="creator-thumbnail-placeholder" :class="{ 'is-loading': state === 'loading' }" role="img" :aria-label="state === 'loading' ? '缩略图加载中' : '缩略图暂不可用'">
      <Icon name="sparkles" size="md" />
    </span>
    <img v-if="thumbnail && state !== 'error'" :key="thumbnail" :src="thumbnail" alt="" loading="lazy" decoding="async" :style="{ visibility: state === 'ready' ? 'visible' : 'hidden' }" @load="loaded" @error="failed" />
  </span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCreatorThumbnail } from '@/services/creatorThumbnail'
import Icon from '@/components/icons/Icon.vue'

const props = defineProps<{ src: string; cacheKey: string }>()
const element = ref<HTMLElement>()
const thumbnail = ref('')
const state = ref<'loading' | 'ready' | 'error'>('loading')
const visible = ref(false)
let observer: IntersectionObserver | undefined

async function loaded(event: Event) {
  const image = event.target as HTMLImageElement
  const source = thumbnail.value
  try {
    if (image.decode) await image.decode()
    if (source === thumbnail.value && image.parentElement === element.value && state.value === 'loading') state.value = 'ready'
  } catch {
    failed(event)
  }
}

function failed(event: Event) {
  if ((event.target as HTMLImageElement).parentElement === element.value) state.value = 'error'
}

watch([() => props.src, () => props.cacheKey, visible], async ([source, key, isVisible], _, onCleanup) => {
  thumbnail.value = ''
  state.value = 'loading'
  if (!source) {
    state.value = 'error'
    return
  }
  if (!isVisible) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const result = await getCreatorThumbnail(key, source, controller.signal)
  // Remote images without CORS can still be displayed by the browser. Only
  // visible rows use this fallback; data URLs always stay out of the list.
  if (!controller.signal.aborted) {
    thumbnail.value = result || (/^https?:|^\//.test(source) ? source : '')
    if (!thumbnail.value) state.value = 'error'
  }
})

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    visible.value = true
    return
  }
  observer = new IntersectionObserver(entries => {
    visible.value = entries.some(entry => entry.isIntersecting)
  }, { root: element.value?.closest('.history-list'), rootMargin: '80px' })
  if (element.value) observer.observe(element.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.creator-thumbnail { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; border-radius: inherit; }
.creator-thumbnail-placeholder { position: absolute; inset: 0; display: grid; place-items: center; background: #e8f0ef; color: #8da09e; }
.creator-thumbnail-placeholder.is-loading::after { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, rgb(255 255 255 / 55%) 50%, transparent 80%); transform: translateX(-100%); animation: thumbnail-shimmer 1.6s ease-in-out infinite; }
.creator-thumbnail img { display: block; width: 100%; height: 100%; object-fit: cover; }
:global(.dark) .creator-thumbnail-placeholder { background: #243833; color: #7e9b92; }
:global(.dark) .creator-thumbnail-placeholder.is-loading::after { background: linear-gradient(100deg, transparent 20%, rgb(255 255 255 / 10%) 50%, transparent 80%); }
@keyframes thumbnail-shimmer { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .creator-thumbnail-placeholder.is-loading::after { animation: none; } }
</style>
