<template>
  <span ref="element" class="creator-video-thumbnail" :aria-busy="state === 'loading'">
    <span v-if="state !== 'ready'" class="video-thumbnail-placeholder" :class="{ 'is-loading': state === 'loading' }" role="img" :aria-label="state === 'loading' ? '视频封面加载中' : '视频封面暂不可用'">
      <Icon name="play" size="sm" />
    </span>
    <img v-if="cover" :src="cover" alt="" decoding="async" :style="{ visibility: state === 'ready' ? 'visible' : 'hidden' }" @load="state = 'ready'" @error="state = 'error'" />
    <span v-if="state === 'ready'" class="video-thumbnail-play"><Icon name="play" size="xs" /></span>
  </span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/components/icons/Icon.vue'
import { getCreatorVideoThumbnail } from '@/services/creatorVideoThumbnail'

const props = defineProps<{ src?: string; videoBlob?: Blob; thumbnail?: string; cacheKey: string }>()
const emit = defineEmits<{ ready: [thumbnail: string] }>()
const element = ref<HTMLElement>()
const cover = ref('')
const state = ref<'loading' | 'ready' | 'error'>('loading')
const visible = ref(false)
let observer: IntersectionObserver | undefined

watch([() => props.src, () => props.videoBlob, () => props.thumbnail, () => props.cacheKey, visible], async (_, __, onCleanup) => {
  if (props.thumbnail && props.thumbnail === cover.value && state.value === 'ready') return
  cover.value = props.thumbnail || ''
  state.value = 'loading'
  if (cover.value || !visible.value) return
  const source = props.videoBlob?.size ? props.videoBlob : props.src
  if (!source) { state.value = 'error'; return }
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const thumbnail = await getCreatorVideoThumbnail(props.cacheKey, source, controller.signal)
  if (controller.signal.aborted) return
  cover.value = thumbnail
  if (thumbnail) emit('ready', thumbnail)
  else state.value = 'error'
}, { immediate: true })

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') { visible.value = true; return }
  observer = new IntersectionObserver(entries => {
    visible.value = entries.some(entry => entry.isIntersecting)
  }, { root: element.value?.closest('.history-list'), rootMargin: '80px' })
  if (element.value) observer.observe(element.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.creator-video-thumbnail { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; border-radius: inherit; }
.video-thumbnail-placeholder { position: absolute; inset: 0; display: grid; place-items: center; background: #e8f0ef; color: #8da09e; }
.video-thumbnail-placeholder.is-loading::after { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, rgb(255 255 255 / 55%) 50%, transparent 80%); transform: translateX(-100%); animation: video-cover-shimmer 1.6s ease-in-out infinite; }
.creator-video-thumbnail img { display: block; width: 100%; height: 100%; object-fit: cover; }
.video-thumbnail-play { position: absolute; right: 3px; bottom: 3px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: rgb(15 23 42 / 60%); color: #fff; }
:global(.dark) .video-thumbnail-placeholder { background: #243833; color: #7e9b92; }
@keyframes video-cover-shimmer { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .video-thumbnail-placeholder.is-loading::after { animation: none; } }
</style>
