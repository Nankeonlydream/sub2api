<template>
  <div
    class="creator-video-player"
    :class="{ 'is-playing': playing, 'controls-visible': touchControlsVisible }"
    @pointerdown.capture="handlePointerDown"
    @click.capture="handleClickCapture"
  >
    <video
      :key="src"
      ref="video"
      :src="src"
      :class="[mediaClass, { 'video-ready': state === 'ready' }]"
      :style="mediaStyle"
      :controls="false"
      :muted="muted"
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
      <span class="video-badge" aria-hidden="true"><Icon name="playOutline" size="sm" /> 视频<span v-if="durationLabel">{{ durationLabel }}</span></span>
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
      <button
        type="button"
        class="video-sound"
        :aria-label="muted ? '打开声音' : '关闭声音'"
        :aria-pressed="muted"
        :title="muted ? '打开声音' : '关闭声音'"
        @click="toggleMuted"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path v-if="muted" d="m16 9 5 6m0-6-5 6" />
          <path v-else d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      </button>
      <button type="button" class="video-fullscreen" aria-label="全屏观看" @click="toggleFullscreen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg>
      </button>
      <span v-if="playbackError" class="video-playback-error" role="status">{{ playbackError }}</span>
    </template>
    <div v-else-if="state === 'loading' && showLoadingFeedback" class="video-skeleton" role="status" aria-live="polite">
      <slot name="loading"><span class="video-sr-only">正在加载视频</span></slot>
    </div>
    <div v-else-if="state === 'error'" class="video-load-error" role="status">
      <span>视频暂时无法加载</span>
      <button type="button" @click="retry">重新加载</button>
    </div>
  </div>
</template>

<script lang="ts">
import { ref } from 'vue'

// One sound preference for every player on the page, remembered across reloads.
const MUTED_STORAGE_KEY = 'creator-video-muted'

function readStoredMuted() {
  try {
    return localStorage.getItem(MUTED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const muted = ref(readStoredMuted())

function setMuted(value: boolean) {
  muted.value = value
  try {
    localStorage.setItem(MUTED_STORAGE_KEY, value ? '1' : '0')
  } catch { /* Keep the in-memory preference when storage is unavailable. */ }
}
</script>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
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
// Touch screens have no hover, so a tap reveals the controls for a moment instead.
const TOUCH_CONTROLS_MS = 2500
const touchControlsVisible = ref(false)
let touchControlsTimer: ReturnType<typeof setTimeout> | undefined
let revealOnlyTap = false

function resetPlayback() {
  clearLoadingTimer()
  clearTouchControlsTimer()
  touchControlsVisible.value = false
  revealOnlyTap = false
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
onBeforeUnmount(() => {
  clearLoadingTimer()
  clearTouchControlsTimer()
})

function clearTouchControlsTimer() {
  if (touchControlsTimer !== undefined) clearTimeout(touchControlsTimer)
  touchControlsTimer = undefined
}

function handlePointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' || state.value !== 'ready') return
  // While playing with the controls hidden, the first tap only brings them back so it can't pause or mute by accident.
  revealOnlyTap = playing.value && !touchControlsVisible.value
  touchControlsVisible.value = true
  clearTouchControlsTimer()
  touchControlsTimer = setTimeout(() => {
    touchControlsTimer = undefined
    touchControlsVisible.value = false
    revealOnlyTap = false
  }, TOUCH_CONTROLS_MS)
}

function handleClickCapture(event: MouseEvent) {
  if (!revealOnlyTap) return
  revealOnlyTap = false
  event.preventDefault()
  event.stopPropagation()
}

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

function toggleMuted() {
  setMuted(!muted.value)
  if (video.value) video.value.muted = muted.value
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
/* Size overlay controls from the player's own width so they stay proportional at any zoom level or card size. */
/* The black fill lives on the video itself, not the clipping container: a dark container shows through the anti-aliased rounded corners as a thin black arc. */
/* While loading, the frame shows the same light tint and shimmer as image cards; the video then fades in over it, so switching works never flashes white or black. */
.creator-video-player { --play-size: clamp(36px, 8cqi, 56px); --control-size: clamp(28px, 7cqi, 36px); --control-inset: clamp(8px, 3cqi, 16px); --control-icon: calc(var(--control-size) * .53); position: relative; display: grid; overflow: hidden; isolation: isolate; container-type: inline-size; background: var(--creator-video-placeholder, #e8f0ee); }
video { position: relative; z-index: 1; display: block; width: 100%; height: 100%; max-height: min(58vh, 620px); border-radius: inherit; background: #000; object-fit: contain; opacity: 0; transition: opacity 220ms ease; }
video.video-ready { opacity: 1; }
.video-skeleton { position: absolute; z-index: 2; inset: 0; overflow: hidden; pointer-events: none; animation: video-skeleton-in 200ms ease both, video-skeleton-pulse 1.6s ease-in-out infinite; }
.video-skeleton::before { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, var(--creator-video-shimmer, rgb(255 255 255 / 85%)) 50%, transparent 80%); transform: translateX(-100%); animation: video-skeleton-shimmer 1.4s ease-in-out infinite; }
.video-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@keyframes video-skeleton-in { from { opacity: 0; } }
@keyframes video-skeleton-shimmer { to { transform: translateX(100%); } }
@keyframes video-skeleton-pulse { 0%, 100% { background-color: transparent; } 50% { background-color: var(--creator-video-pulse, rgb(20 158 140 / 8%)); } }
:global(.dark) .creator-video-player { --creator-video-placeholder: #172b27; --creator-video-shimmer: rgb(255 255 255 / 8%); --creator-video-pulse: rgb(131 221 208 / 6%); }
/* Same height, border and fill as the corner buttons so the overlay controls read as one set.
   Corner controls scale with the player width: full size from ~515px wide, down to 28px on narrow phone cards. */
.video-badge { position: absolute; z-index: 3; top: var(--control-inset); right: var(--control-inset); display: flex; align-items: center; gap: 5px; box-sizing: border-box; height: var(--control-size); padding: 0 calc(var(--control-size) * .3); border: 1px solid rgb(255 255 255 / 25%); border-radius: var(--creator-radius, 12px); color: #fff; background: rgb(15 23 23 / 48%); backdrop-filter: blur(10px); font-size: calc(var(--control-size) * .36); line-height: 1; pointer-events: none; transition: opacity 160ms ease; }
.video-badge > svg { width: calc(var(--control-icon) * .85); height: calc(var(--control-icon) * .85); }
.video-badge > span { margin-left: 3px; color: rgb(255 255 255 / 80%); font-variant-numeric: tabular-nums; }
.video-play-toggle { position: absolute; z-index: 2; inset: 0; display: grid; place-items: center; width: 100%; height: 100%; border: 0; background: transparent; cursor: pointer; }
.video-play-symbol { display: grid; place-items: center; width: var(--play-size); height: var(--play-size); border: 1px solid rgb(255 255 255 / 60%); border-radius: 50%; color: #fff; background: rgb(15 23 23 / 42%); backdrop-filter: blur(12px); box-shadow: 0 6px 24px rgb(0 0 0 / 18%); transition: opacity 160ms ease, transform 160ms ease, background 160ms ease; }
.video-play-symbol > svg { width: calc(var(--play-size) * .4); height: calc(var(--play-size) * .4); }
.video-play-toggle:hover .video-play-symbol { transform: scale(1.06); background: rgb(15 23 23 / 60%); }
.is-playing .video-play-symbol { opacity: 0; }
.video-play-toggle:focus-visible .video-play-symbol, .is-playing.controls-visible .video-play-symbol { opacity: 1; }
.video-play-toggle:focus-visible { outline: 3px solid #7ce5d5; outline-offset: -4px; }
.video-fullscreen { position: absolute; z-index: 3; right: var(--control-inset); bottom: var(--control-inset); display: grid; place-items: center; width: var(--control-size); height: var(--control-size); border: 1px solid rgb(255 255 255 / 25%); border-radius: var(--creator-radius, 12px); color: #fff; background: rgb(15 23 23 / 48%); backdrop-filter: blur(10px); transition: opacity 160ms ease; }
.video-fullscreen > svg { width: var(--control-icon); height: var(--control-icon); }
.video-fullscreen:focus-visible { outline: 2px solid #7ce5d5; outline-offset: 3px; }
.video-sound { position: absolute; z-index: 3; right: calc(var(--control-inset) + var(--control-size) + 8px); bottom: var(--control-inset); display: grid; place-items: center; width: var(--control-size); height: var(--control-size); border: 1px solid rgb(255 255 255 / 25%); border-radius: var(--creator-radius, 12px); color: #fff; background: rgb(15 23 23 / 48%); backdrop-filter: blur(10px); transition: opacity 160ms ease; }
.video-sound > svg { width: var(--control-icon); height: var(--control-icon); }
.video-sound:focus-visible { outline: 2px solid #7ce5d5; outline-offset: 3px; }
/* Before playback the badge and corner controls read as part of the cover; once playing they only return on hover or keyboard focus. */
.is-playing .video-badge, .is-playing .video-sound, .is-playing .video-fullscreen { opacity: 0; }
.is-playing.controls-visible .video-badge, .is-playing.controls-visible .video-sound, .is-playing.controls-visible .video-fullscreen, .is-playing .video-sound:focus-visible, .is-playing .video-fullscreen:focus-visible { opacity: 1; }
/* Mobile browsers keep :hover stuck after a tap, so hover only reveals controls for a real pointer. */
@media (hover: hover) {
  .is-playing:hover .video-play-symbol, .is-playing:hover .video-badge, .is-playing:hover .video-sound, .is-playing:hover .video-fullscreen { opacity: 1; }
}
.video-playback-error { position: absolute; z-index: 3; bottom: var(--control-inset); left: 50%; transform: translateX(-50%); max-width: calc(100% - 110px); padding: 7px 10px; border-radius: var(--creator-radius-small, 8px); color: #fff; background: rgb(15 23 23 / 70%); font-size: 11px; text-align: center; pointer-events: none; }
.video-load-error { position: absolute; z-index: 2; inset: 0; display: grid; justify-items: center; align-content: center; gap: 12px; color: #dcebe8; background: #142321; font-size: 13px; }
.video-load-error button { padding: 8px 14px; border: 1px solid #65988e; border-radius: var(--creator-radius, 12px); color: #dcebe8; background: #233e37; }
.creator-video-player:fullscreen { width: 100%; height: 100%; max-height: none !important; aspect-ratio: auto !important; margin: 0; border-radius: 0; background: #000; }
.creator-video-player:fullscreen video { max-height: none !important; }
@media (prefers-reduced-motion: reduce) { video, .video-badge, .video-play-symbol, .video-fullscreen, .video-sound { transition: none; } .video-skeleton::before { display: none; } }
</style>
