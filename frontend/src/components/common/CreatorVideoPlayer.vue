<template>
  <div class="creator-video-player" :class="{ 'is-playing': playing }">
    <video
      :key="src"
      ref="video"
      :src="src"
      :class="[mediaClass, { 'video-ready': state === 'ready' }]"
      :style="mediaStyle"
      :controls="false"
      playsinline
      preload="auto"
      @loadstart="handleLoadStart"
      @loadedmetadata="handleMetadata"
      @loadeddata="handleLoadedData"
      @durationchange="readDuration"
      @play="playing = true; playbackError = ''"
      @pause="playing = false"
      @ended="playing = false"
      @error="handleError"
    ></video>
    <template v-if="state === 'ready'">
      <span class="video-badge" aria-hidden="true"><Icon name="playOutline" size="xs" /> 视频<span v-if="durationLabel">{{ durationLabel }}</span></span>
      <button
        type="button"
        class="video-play-toggle"
        :aria-label="playing ? '暂停视频' : '播放视频'"
        @click="togglePlayback"
      >
        <span class="video-play-symbol">
          <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          <Icon v-else name="play" size="lg" />
        </span>
      </button>
      <button type="button" class="video-fullscreen" aria-label="全屏观看" @click="toggleFullscreen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg>
      </button>
      <span v-if="playbackError" class="video-playback-error" role="status">{{ playbackError }}</span>
    </template>
    <template v-else-if="state === 'loading' && showLoadingFeedback"><slot name="loading" /></template>
    <div v-else-if="state === 'error'" class="video-load-error" role="status">
      <span>视频暂时无法加载</span>
      <button type="button" @click="retry">重新加载</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { StyleValue } from 'vue'
import Icon from '@/components/icons/Icon.vue'

const props = defineProps<{ src: string; mediaClass?: string; mediaStyle?: StyleValue }>()
const emit = defineEmits<{ loadstart: [event: Event]; loadedmetadata: [event: Event]; error: [event: Event] }>()
const video = ref<HTMLVideoElement | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const showLoadingFeedback = ref(false)
let loadingTimer: ReturnType<typeof setTimeout> | undefined
const playing = ref(false)
const durationLabel = ref('')
const playbackError = ref('')

function resetPlayback() {
  clearLoadingTimer()
  state.value = 'loading'
  showLoadingFeedback.value = false
  playing.value = false
  durationLabel.value = ''
  playbackError.value = ''
  loadingTimer = setTimeout(() => {
    loadingTimer = undefined
    if (state.value === 'loading') showLoadingFeedback.value = true
  }, 150)
}

function clearLoadingTimer() {
  if (loadingTimer !== undefined) clearTimeout(loadingTimer)
  loadingTimer = undefined
}

function isCurrentVideo(event: Event) {
  return event.currentTarget === video.value
}

function handleLoadStart(event: Event) {
  if (!isCurrentVideo(event)) return
  resetPlayback()
  emit('loadstart', event)
}

function handleMetadata(event: Event) {
  if (!isCurrentVideo(event)) return
  readDuration()
  emit('loadedmetadata', event)
}

function handleLoadedData(event: Event) {
  if (!isCurrentVideo(event)) return
  clearLoadingTimer()
  showLoadingFeedback.value = false
  state.value = 'ready'
  readDuration()
}

function handleError(event: Event) {
  if (!isCurrentVideo(event)) return
  clearLoadingTimer()
  state.value = 'error'
  playing.value = false
  emit('error', event)
}

function retry() {
  resetPlayback()
  video.value?.load()
}

watch(() => props.src, resetPlayback, { immediate: true, flush: 'sync' })
onBeforeUnmount(clearLoadingTimer)

function readDuration() {
  const duration = video.value?.duration
  if (!duration || !Number.isFinite(duration)) return
  const seconds = Math.round(duration)
  durationLabel.value = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

async function togglePlayback() {
  const media = video.value
  if (!media || state.value !== 'ready') return
  if (!media.paused) {
    media.pause()
    return
  }
  playbackError.value = ''
  try {
    if (media.ended) media.currentTime = 0
    await media.play()
  } catch {
    if (media === video.value && state.value === 'ready') playbackError.value = '暂时无法播放，请点击重试'
  }
}

async function toggleFullscreen() {
  const frame = video.value?.parentElement
  if (!frame) return
  try {
    if (document.fullscreenElement === frame) await document.exitFullscreen()
    else if (frame.requestFullscreen) await frame.requestFullscreen()
    else (video.value as HTMLVideoElement & { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.()
  } catch { /* Keep inline playback available if fullscreen is unavailable. */ }
}
</script>

<style scoped>
.creator-video-player { position: relative; display: grid; overflow: hidden; background: #101b1a; isolation: isolate; }
video { position: relative; z-index: 1; display: block; width: 100%; height: 100%; max-height: min(58vh, 620px); border-radius: inherit; object-fit: contain; opacity: 0; transition: opacity 180ms ease; }
video.video-ready { opacity: 1; }
.video-badge { position: absolute; z-index: 3; top: 16px; right: 16px; display: flex; align-items: center; gap: 6px; padding: 7px 10px; border: 1px solid rgb(255 255 255 / 20%); border-radius: 10px; color: #fff; background: rgb(15 23 23 / 48%); backdrop-filter: blur(10px); font-size: 11px; line-height: 1; pointer-events: none; }
.video-badge > span { margin-left: 3px; color: rgb(255 255 255 / 80%); font-variant-numeric: tabular-nums; }
.video-play-toggle { position: absolute; z-index: 2; inset: 0; display: grid; place-items: center; width: 100%; height: 100%; border: 0; background: transparent; cursor: pointer; }
.video-play-symbol { display: grid; place-items: center; width: 68px; height: 68px; border: 1px solid rgb(255 255 255 / 60%); border-radius: 50%; color: #fff; background: rgb(15 23 23 / 42%); backdrop-filter: blur(12px); box-shadow: 0 6px 24px rgb(0 0 0 / 18%); transition: opacity 160ms ease, transform 160ms ease, background 160ms ease; }
.video-play-symbol > svg { width: 28px; height: 28px; }
.video-play-toggle:hover .video-play-symbol { transform: scale(1.06); background: rgb(15 23 23 / 60%); }
.is-playing .video-play-symbol { opacity: 0; }
.is-playing:hover .video-play-symbol, .video-play-toggle:focus-visible .video-play-symbol { opacity: 1; }
.video-play-toggle:focus-visible { outline: 3px solid #7ce5d5; outline-offset: -4px; }
.video-fullscreen { position: absolute; z-index: 3; right: 16px; bottom: 16px; display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid rgb(255 255 255 / 25%); border-radius: 10px; color: #fff; background: rgb(15 23 23 / 48%); backdrop-filter: blur(10px); opacity: 0; transition: opacity 160ms ease; }
.video-fullscreen > svg { width: 19px; height: 19px; }
.creator-video-player:hover .video-fullscreen, .video-fullscreen:focus-visible { opacity: 1; }
.video-fullscreen:focus-visible { outline: 2px solid #7ce5d5; outline-offset: 3px; }
.video-playback-error { position: absolute; z-index: 3; bottom: 16px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 110px); padding: 7px 10px; border-radius: 8px; color: #fff; background: rgb(15 23 23 / 70%); font-size: 11px; text-align: center; pointer-events: none; }
.video-load-error { position: absolute; z-index: 2; inset: 0; display: grid; justify-items: center; align-content: center; gap: 12px; color: #dcebe8; background: #142321; font-size: 13px; }
.video-load-error button { padding: 8px 14px; border: 1px solid #65988e; border-radius: 10px; color: #dcebe8; background: #233e37; }
.creator-video-player:fullscreen { width: 100%; height: 100%; max-height: none !important; aspect-ratio: auto !important; margin: 0; border-radius: 0; background: #000; }
.creator-video-player:fullscreen video { max-height: none !important; }
@media (hover: none) { .video-fullscreen { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { video, .video-play-symbol, .video-fullscreen { transition: none; } }
</style>
