<template>
  <div
    ref="frame"
    class="creator-video-player"
    :class="{ 'is-playing': playing, 'has-started': started, 'is-fullscreen': fullscreen, 'controls-visible': touchControlsVisible }"
    @pointerdown.capture="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
    @click.capture="handleClickCapture"
  >
    <video
      :key="src"
      ref="video"
      :src="src"
      :class="[mediaClass, { 'video-ready': state === 'ready', 'fills-frame': fillsFrame && !fullscreen }]"
      :style="mediaStyle"
      :controls="false"
      :muted="muted"
      playsinline
      preload="auto"
      @loadstart="handleLoadStart"
      @loadedmetadata="handleMetadata"
      @loadeddata="handleLoadedData"
      @durationchange="readDuration"
      @play="handlePlay"
      @pause="handlePause"
      @ended="handlePause"
      @timeupdate="readCurrentTime"
      @seeked="handleSeeked"
      @error="handleError"
    ></video>
    <template v-if="state === 'ready'">
      <span v-if="!started && !fullscreen" class="video-badge" aria-hidden="true"><Icon name="playOutline" size="sm" /> 视频<span v-if="durationLabel">{{ durationLabel }}</span></span>
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
      <div class="video-controls">
        <button type="button" class="video-control video-skip" :aria-label="`后退 ${SKIP_SECONDS} 秒`" :title="`后退 ${SKIP_SECONDS} 秒`" @click="skip(-SKIP_SECONDS)">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 7.06v9.88a.8.8 0 0 1-1.23.67L2.9 13.18a1.4 1.4 0 0 1 0-2.36l6.87-4.43a.8.8 0 0 1 1.23.67Z" /><path d="M21 7.06v9.88a.8.8 0 0 1-1.23.67l-6.87-4.43a1.4 1.4 0 0 1 0-2.36l6.87-4.43a.8.8 0 0 1 1.23.67Z" /></svg>
        </button>
        <button type="button" class="video-control video-bar-play" :aria-label="playing ? '暂停视频' : '播放视频'" @click="togglePlayback">
          <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.9v12.2a1 1 0 0 0 1.5.86l9.8-6.1a1 1 0 0 0 0-1.72L9.5 5.04A1 1 0 0 0 8 5.9Z" /></svg>
        </button>
        <button type="button" class="video-control video-skip" :aria-label="`前进 ${SKIP_SECONDS} 秒`" :title="`前进 ${SKIP_SECONDS} 秒`" @click="skip(SKIP_SECONDS)">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 7.06v9.88a.8.8 0 0 0 1.23.67l6.87-4.43a1.4 1.4 0 0 0 0-2.36l-6.87-4.43a.8.8 0 0 0-1.23.67Z" /><path d="M3 7.06v9.88a.8.8 0 0 0 1.23.67l6.87-4.43a1.4 1.4 0 0 0 0-2.36L4.23 6.39A.8.8 0 0 0 3 7.06Z" /></svg>
        </button>
        <span class="video-time" aria-hidden="true">{{ formatClock(currentTime) }}</span>
        <input
          class="video-progress"
          type="range"
          min="0"
          :max="duration || 0"
          step="0.01"
          :value="currentTime"
          :style="{ '--progress': `${progressPercent}%` }"
          aria-label="播放进度"
          :aria-valuetext="`${formatClock(currentTime)} / ${formatClock(duration)}`"
          @pointerdown="startScrub"
          @input="seek"
          @change="endScrub"
          @keydown="handleProgressKeydown"
        />
        <span class="video-time" aria-hidden="true">{{ formatClock(duration) }}</span>
        <button type="button" class="video-control video-speed" :aria-label="`播放速度 ${playbackRate} 倍`" title="播放速度" @click="cyclePlaybackRate">{{ playbackRate }}x</button>
        <div class="video-volume">
          <button
            type="button"
            class="video-control video-sound"
            :aria-label="muted ? '打开声音' : '关闭声音'"
            :aria-pressed="muted"
            :title="muted ? '打开声音' : '关闭声音'"
            @click="toggleMuted"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path v-if="muted || volume === 0" d="m16 9 5 6m0-6-5 6" />
              <path v-else-if="volume < 0.5" d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path v-else d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          </button>
          <input
            class="video-volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="muted ? 0 : volume"
            :style="{ '--progress': `${(muted ? 0 : volume) * 100}%` }"
            aria-label="音量"
            :aria-valuetext="`${Math.round((muted ? 0 : volume) * 100)}%`"
            @input="changeVolume"
          />
        </div>
        <button type="button" class="video-control video-fullscreen" :aria-label="fullscreen ? '退出全屏' : '全屏观看'" :title="fullscreen ? '退出全屏' : '全屏观看'" @click="toggleFullscreen">
          <svg v-if="fullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg>
        </button>
      </div>
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

// Every player starts with sound on; muting only affects that player and is not remembered.
// Clear the key older builds used to remember mute, so returning users also start with sound.
try {
  localStorage.removeItem('creator-video-muted')
} catch { /* Storage unavailable: nothing to clear. */ }

// Volume level (0–1) is separate from mute; the last level chosen becomes the starting level for new players.
const VOLUME_STORAGE_KEY = 'creator-video-volume'

function readStoredVolume() {
  try {
    const value = Number(localStorage.getItem(VOLUME_STORAGE_KEY))
    return localStorage.getItem(VOLUME_STORAGE_KEY) !== null && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1
  } catch {
    return 1
  }
}

function storeVolume(value: number) {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(value))
  } catch { /* Storage unavailable: new players just start at full volume. */ }
}

// Only one player on the page plays at a time; starting another pauses the previous one.
let activeVideo: HTMLVideoElement | null = null

function claimPlayback(media: HTMLVideoElement) {
  if (activeVideo && activeVideo !== media && !activeVideo.paused) activeVideo.pause()
  activeVideo = media
}

function releasePlayback(media: HTMLVideoElement | null) {
  if (media && activeVideo === media) activeVideo = null
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import type { StyleValue } from 'vue'
import Icon from '@/components/icons/Icon.vue'

const props = defineProps<{ src: string; mediaClass?: string; mediaStyle?: StyleValue }>()
const emit = defineEmits<{ loadstart: [event: Event]; loadedmetadata: [event: Event]; ready: [event: Event]; error: [event: Event] }>()
// Works standalone too: without a parent binding, defineModel keeps the value locally.
const muted = defineModel<boolean>('muted', { default: false })
const volume = ref(readStoredVolume())
const video = ref<HTMLVideoElement | null>(null)
const frame = ref<HTMLDivElement | null>(null)
const fullscreen = ref(false)
// True when the frame already has the video's own ratio; see updateFrameFit.
const fillsFrame = ref(false)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const showLoadingFeedback = ref(false)
let loadingTimer: ReturnType<typeof setTimeout> | undefined
const playing = ref(false)
// Before the first play only the centre play button shows; after that only the bottom control bar does.
const started = ref(false)
const durationLabel = ref('')
const playbackError = ref('')
const duration = ref(0)
const currentTime = ref(0)
const progressPercent = computed(() => (duration.value > 0 ? Math.min(100, (currentTime.value / duration.value) * 100) : 0))
// Generated clips are mostly 5 to 15 seconds long, so a short jump is more useful than the usual 10 or 15.
const SKIP_SECONDS = 5
const PLAYBACK_RATES = [1, 1.5, 2, 0.5]
const playbackRate = ref(1)
let progressFrame: number | undefined
// Touch screens have no hover, so a tap reveals the controls for a moment instead.
const TOUCH_CONTROLS_MS = 2500
// In fullscreen the controls get out of the way quickly once the mouse rests.
const FULLSCREEN_MOUSE_CONTROLS_MS = 1000
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
  started.value = false
  stopProgressLoop()
  durationLabel.value = ''
  duration.value = 0
  currentTime.value = 0
  playbackRate.value = 1
  playbackError.value = ''
  fillsFrame.value = false
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
  updateFrameFit()
}

// A frame with a fractional height leaves a sub-pixel strip below the pixel-snapped picture, which shows as a thin black line.
// When the frame matches the video's ratio, the video covers it and overflows by 1px so the strip is clipped away.
// Frames with a different ratio (height capped, or fullscreen) keep contain so nothing is cropped.
const FRAME_FIT_TOLERANCE = 0.005
let frameResizeObserver: ResizeObserver | undefined

function updateFrameFit() {
  const media = video.value
  const box = frame.value
  if (!media?.videoWidth || !media.videoHeight || !box?.clientWidth || !box.clientHeight) {
    fillsFrame.value = false
    return
  }
  const videoRatio = media.videoWidth / media.videoHeight
  const frameRatio = box.clientWidth / box.clientHeight
  fillsFrame.value = Math.abs(videoRatio - frameRatio) / videoRatio <= FRAME_FIT_TOLERANCE
}

function handleLoadedData(event: Event) {
  if (!isCurrentVideo(event)) return
  clearLoadingTimer()
  showLoadingFeedback.value = false
  state.value = 'ready'
  if (video.value) video.value.volume = volume.value
  readDuration()
  emit('ready', event)
}

function handleError(event: Event) {
  if (!isCurrentVideo(event)) return
  clearLoadingTimer()
  state.value = 'error'
  playing.value = false
  stopProgressLoop()
  emit('error', event)
}

function retry() {
  resetPlayback()
  video.value?.load()
}

watch(() => props.src, resetPlayback, { immediate: true, flush: 'sync' })
function syncFullscreen() {
  fullscreen.value = !!frame.value && document.fullscreenElement === frame.value
  if (fullscreen.value) {
    showControlsBriefly(FULLSCREEN_MOUSE_CONTROLS_MS)
  } else {
    clearTouchControlsTimer()
    touchControlsVisible.value = false
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreen)
  if (typeof ResizeObserver !== 'undefined' && frame.value) {
    frameResizeObserver = new ResizeObserver(updateFrameFit)
    frameResizeObserver.observe(frame.value)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  frameResizeObserver?.disconnect()
  clearLoadingTimer()
  clearTouchControlsTimer()
  stopProgressLoop()
  endScrub()
  releasePlayback(video.value)
})

function clearTouchControlsTimer() {
  if (touchControlsTimer !== undefined) clearTimeout(touchControlsTimer)
  touchControlsTimer = undefined
}

function showControlsBriefly(duration = TOUCH_CONTROLS_MS) {
  touchControlsVisible.value = true
  clearTouchControlsTimer()
  touchControlsTimer = setTimeout(() => {
    touchControlsTimer = undefined
    touchControlsVisible.value = false
    revealOnlyTap = false
  }, duration)
}

function handlePointerDown(event: PointerEvent) {
  if (state.value !== 'ready') return
  if (event.pointerType === 'mouse') {
    if (fullscreen.value) showControlsBriefly(FULLSCREEN_MOUSE_CONTROLS_MS)
    return
  }
  // While playing with the controls hidden, the first tap only brings them back so it can't pause or mute by accident.
  revealOnlyTap = playing.value && !touchControlsVisible.value
  showControlsBriefly()
}

// In fullscreen the mouse is always over the player, so hover would keep the controls up forever.
// Show them on movement and hide them again once the mouse rests.
function handlePointerMove(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !fullscreen.value || state.value !== 'ready') return
  showControlsBriefly(FULLSCREEN_MOUSE_CONTROLS_MS)
}

function handlePointerLeave(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !fullscreen.value) return
  clearTouchControlsTimer()
  touchControlsVisible.value = false
}

function handleClickCapture(event: MouseEvent) {
  if (!revealOnlyTap) return
  revealOnlyTap = false
  event.preventDefault()
  event.stopPropagation()
}

function readDuration() {
  const length = video.value?.duration
  if (!length || !Number.isFinite(length)) return
  duration.value = length
  const seconds = Math.round(length)
  durationLabel.value = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function formatClock(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

// While the thumb is held the video pauses, so the thumb stays under the pointer; playback resumes on release.
let scrubbing = false
let resumeAfterScrub = false

function readCurrentTime() {
  if (video.value && !scrubbing) currentTime.value = video.value.currentTime
}

function startScrub() {
  // A tap that only reveals hidden controls is not a drag.
  if (revealOnlyTap || state.value !== 'ready') return
  scrubbing = true
  const media = video.value
  resumeAfterScrub = !!media && !media.paused
  if (resumeAfterScrub) media?.pause()
  document.addEventListener('pointerup', endScrub)
  document.addEventListener('pointercancel', endScrub)
}

function endScrub() {
  document.removeEventListener('pointerup', endScrub)
  document.removeEventListener('pointercancel', endScrub)
  if (!scrubbing) return
  scrubbing = false
  const media = video.value
  const resume = resumeAfterScrub
  resumeAfterScrub = false
  const target = scrubTarget
  scrubTarget = null
  scrubSeekPending = false
  // Land exactly where the thumb was dropped; fastSeek or a skipped pending seek may have left the video short of it.
  if (media && target !== null && media.currentTime !== target) media.currentTime = target
  readCurrentTime()
  if (!media || !resume) return
  // Dropped at the very end: stay there instead of restarting from the beginning.
  if (media.ended || (duration.value > 0 && media.currentTime >= duration.value)) {
    playing.value = false
    return
  }
  media.play()?.catch(() => {
    if (media === video.value && state.value === 'ready') {
      playing.value = false
      playbackError.value = '暂时无法播放，请点击重试'
    }
  })
}

// timeupdate only fires about four times a second, which makes the bar jump on short clips; follow frames while playing instead.
function startProgressLoop() {
  if (progressFrame !== undefined || typeof requestAnimationFrame !== 'function') return
  const tick = () => {
    readCurrentTime()
    progressFrame = requestAnimationFrame(tick)
  }
  progressFrame = requestAnimationFrame(tick)
}

function stopProgressLoop() {
  if (progressFrame !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(progressFrame)
  progressFrame = undefined
}

function handlePlay() {
  if (video.value) claimPlayback(video.value)
  playing.value = true
  started.value = true
  playbackError.value = ''
  startProgressLoop()
}

function handlePause() {
  // The pause made by a drag is temporary, so the button keeps showing the playing state.
  if (!resumeAfterScrub) playing.value = false
  stopProgressLoop()
  readCurrentTime()
}

// A drag fires input dozens of times a second. Starting a new seek before the last one finishes throws the
// decode work away, so the picture freezes until the pointer stops. Instead each seek runs to completion and the
// next one jumps straight to the newest position.
let scrubTarget: number | null = null
let scrubSeekPending = false

function scrubSeek(media: HTMLVideoElement, target: number) {
  // fastSeek lands on the nearest keyframe, which is much quicker while dragging; release then seeks precisely.
  if (typeof media.fastSeek === 'function') media.fastSeek(target)
  else media.currentTime = target
}

function seekTo(time: number) {
  const media = video.value
  if (!media || state.value !== 'ready') return
  const end = duration.value || media.duration || 0
  const target = Math.min(Math.max(time, 0), Number.isFinite(end) ? end : time)
  currentTime.value = target
  if (!scrubbing) {
    media.currentTime = target
    return
  }
  scrubTarget = target
  if (media.seeking) {
    scrubSeekPending = true
    return
  }
  scrubSeek(media, target)
}

function handleSeeked(event: Event) {
  if (!isCurrentVideo(event)) return
  const media = video.value
  if (media && scrubbing && scrubSeekPending && scrubTarget !== null) {
    scrubSeekPending = false
    scrubSeek(media, scrubTarget)
    return
  }
  readCurrentTime()
}

function seek(event: Event) {
  const input = event.target as HTMLInputElement
  // A touch on the hidden bar only brings the controls back; it must not jump the video.
  if (revealOnlyTap) {
    input.value = String(currentTime.value)
    return
  }
  seekTo(Number(input.value))
  if (touchControlsVisible.value) showControlsBriefly(fullscreen.value ? FULLSCREEN_MOUSE_CONTROLS_MS : TOUCH_CONTROLS_MS)
}

function handleProgressKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  skip(event.key === 'ArrowLeft' ? -SKIP_SECONDS : SKIP_SECONDS)
}

function skip(delta: number) {
  const media = video.value
  if (!media) return
  seekTo(media.currentTime + delta)
}

function cyclePlaybackRate() {
  const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate.value) + 1) % PLAYBACK_RATES.length]
  playbackRate.value = next
  if (video.value) video.value.playbackRate = next
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

async function replay() {
  const media = video.value
  if (!media || state.value !== 'ready') return
  playbackError.value = ''
  media.currentTime = 0
  currentTime.value = 0
  try {
    await media.play()
  } catch {
    if (media === video.value && state.value === 'ready') playbackError.value = '暂时无法播放，请点击重试'
  }
}

// Opens the player in fullscreen and starts playback, for a button outside the player.
async function playFullscreen() {
  if (!fullscreen.value) await toggleFullscreen()
  const media = video.value
  if (!media || state.value !== 'ready' || !media.paused) return
  playbackError.value = ''
  try {
    if (media.ended) media.currentTime = 0
    await media.play()
  } catch {
    if (media === video.value && state.value === 'ready') playbackError.value = '暂时无法播放，请点击重试'
  }
}

defineExpose({ replay, playFullscreen })

// Mute can also be toggled from outside the player (v-model:muted), so keep the element in sync.
watch(muted, (value) => {
  if (video.value) video.value.muted = value
})

function toggleMuted() {
  // Unmuting at zero volume would still be silent, so bring the level back up.
  if (muted.value && volume.value === 0) applyVolume(1)
  muted.value = !muted.value
  if (video.value) video.value.muted = muted.value
}

function applyVolume(value: number) {
  volume.value = value
  storeVolume(value)
  if (video.value) video.value.volume = value
}

// Dragging the slider is an explicit "I want to hear this": any level above zero unmutes, zero mutes.
function changeVolume(event: Event) {
  const value = Math.min(1, Math.max(0, Number((event.target as HTMLInputElement).value)))
  applyVolume(value)
  const nextMuted = value === 0
  if (muted.value !== nextMuted) {
    muted.value = nextMuted
    if (video.value) video.value.muted = nextMuted
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
/* Size overlay controls from the player's own width so they stay proportional at any zoom level or card size. */
/* The black fill lives on the video itself, not the clipping container: a dark container shows through the anti-aliased rounded corners as a thin black arc. */
/* While loading, the frame shows the same light tint and shimmer as image cards; the video then fades in over it, so switching works never flashes white or black. */
.creator-video-player { --glass-bg: linear-gradient(160deg, rgb(255 255 255 / 12%), rgb(255 255 255 / 3%)); --glass-bg-hover: linear-gradient(160deg, rgb(255 255 255 / 20%), rgb(255 255 255 / 7%)); --glass-border: rgb(255 255 255 / 26%); --glass-shadow: 0 4px 20px rgb(0 0 0 / 12%); --glass-blur: blur(16px) saturate(180%) brightness(1.04); --play-size: clamp(36px, 8cqi, 56px); --control-size: clamp(28px, 7cqi, 36px); --control-inset: clamp(8px, 3cqi, 16px); --control-icon: calc(var(--control-size) * .6); position: relative; display: grid; overflow: hidden; isolation: isolate; container-type: inline-size; background: var(--creator-video-placeholder, #e8f0ee); }
video { position: relative; z-index: 1; display: block; width: 100%; height: 100%; max-height: min(58vh, 620px); border-radius: inherit; background: #000; object-fit: contain; opacity: 0; transition: opacity 220ms ease; }
video.video-ready { opacity: 1; }
/* Overrides the inline max-height a parent may pass; the frame's own overflow clips the extra pixel. */
video.fills-frame { height: calc(100% + 1px); max-height: none !important; object-fit: cover; }
.video-skeleton { position: absolute; z-index: 2; inset: 0; overflow: hidden; pointer-events: none; animation: video-skeleton-in 200ms ease both, video-skeleton-pulse 1.6s ease-in-out infinite; }
.video-skeleton::before { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, var(--creator-video-shimmer, rgb(255 255 255 / 85%)) 50%, transparent 80%); transform: translateX(-100%); animation: video-skeleton-shimmer 1.4s ease-in-out infinite; }
.video-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@keyframes video-skeleton-in { from { opacity: 0; } }
@keyframes video-skeleton-shimmer { to { transform: translateX(100%); } }
@keyframes video-skeleton-pulse { 0%, 100% { background-color: transparent; } 50% { background-color: var(--creator-video-pulse, rgb(20 158 140 / 8%)); } }
:global(.dark) .creator-video-player { --creator-video-placeholder: #172b27; --creator-video-shimmer: rgb(255 255 255 / 8%); --creator-video-pulse: rgb(131 221 208 / 6%); }
/* Same height, border and fill as the corner buttons so the overlay controls read as one set.
   Corner controls scale with the player width: full size from ~515px wide, down to 28px on narrow phone cards. */
.video-badge { position: absolute; z-index: 3; top: var(--control-inset); right: var(--control-inset); display: flex; align-items: center; gap: 5px; box-sizing: border-box; height: var(--control-size); padding: 0 calc(var(--control-size) * .3); border-radius: var(--creator-radius, 12px); font-size: calc(var(--control-size) * .36); font-weight: 600; line-height: 1; pointer-events: none; transition: opacity 160ms ease; border: 1px solid var(--glass-border); color: #fff; background: var(--glass-bg); box-shadow: var(--glass-shadow); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); }
.video-badge, .video-play-symbol, .video-controls { text-shadow: 0 1px 2px rgb(0 0 0 / 35%); }
.video-badge > svg, .video-play-symbol > svg, .video-control > svg { filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 35%)); }
.video-badge > svg { width: calc(var(--control-icon) * .85); height: calc(var(--control-icon) * .85); }
.video-badge > span { margin-left: 3px; color: #fff; font-variant-numeric: tabular-nums; }
.video-play-toggle { position: absolute; z-index: 2; inset: 0; display: grid; place-items: center; width: 100%; height: 100%; border: 0; background: transparent; cursor: pointer; }
.video-play-symbol { display: grid; place-items: center; width: var(--play-size); height: var(--play-size); border-radius: 50%; transition: opacity 160ms ease, transform 160ms ease, background 160ms ease; border: 1px solid var(--glass-border); color: #fff; background: var(--glass-bg); box-shadow: var(--glass-shadow); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); }
.video-play-symbol > svg { width: calc(var(--play-size) * .4); height: calc(var(--play-size) * .4); }
.video-play-toggle:hover .video-play-symbol { transform: scale(1.06); background: var(--glass-bg-hover); }
.is-playing .video-play-symbol { opacity: 0; }
.video-play-toggle:focus-visible .video-play-symbol, .is-playing.controls-visible .video-play-symbol { opacity: 1; }
.video-play-toggle:focus-visible { outline: 3px solid #7ce5d5; outline-offset: -4px; }
/* A centred dark frosted-glass bar with a capped width so the bar doesn't stretch across wide players. */
.video-controls { position: absolute; z-index: 3; bottom: var(--control-inset); left: 50%; display: flex; align-items: center; gap: calc(var(--control-size) * .14); box-sizing: border-box; width: min(calc(100% - var(--control-inset) * 2), 820px); height: calc(var(--control-size) + 8px); padding: 0 calc(var(--control-size) * .3); border-radius: var(--creator-radius, 12px); transform: translateX(-50%); transition: opacity 160ms ease; border: 1px solid var(--glass-border); color: #fff; background: var(--glass-bg); box-shadow: var(--glass-shadow); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); }
.creator-video-player:fullscreen .video-controls { width: min(calc(100% - var(--control-inset) * 2), 1040px); }
.video-control { display: grid; flex: none; place-items: center; width: var(--control-size); height: var(--control-size); padding: 0; border: 0; border-radius: var(--creator-radius-small, 8px); color: #fff; text-shadow: inherit; background: transparent; cursor: pointer; }
.video-control > svg { width: var(--control-icon); height: var(--control-icon); }
/* These glyphs fill almost the whole viewBox, so they're drawn smaller to sit level with the speed and time text beside them. */
.video-sound > svg, .video-fullscreen > svg { width: calc(var(--control-size) * .46); height: calc(var(--control-size) * .46); }
.video-control:focus-visible { outline: 2px solid #7ce5d5; outline-offset: 1px; }
.video-speed { width: auto; min-width: var(--control-size); padding: 0 4px; color: #fff; font-size: calc(var(--control-size) * .4); font-weight: 600; font-variant-numeric: tabular-nums; }
.video-time { flex: none; padding: 0 2px; color: #fff; font-size: calc(var(--control-size) * .4); font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; }
/* The filled part of the track is painted from --progress so it looks the same in every browser. */
.video-progress { --track: linear-gradient(to right, #fff var(--progress, 0%), rgb(255 255 255 / 28%) var(--progress, 0%)); flex: 1 1 auto; min-width: 40px; height: var(--control-size); margin: 0 4px; background: transparent; cursor: pointer; appearance: none; -webkit-appearance: none; }
.video-progress::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: var(--track); }
.video-progress::-webkit-slider-thumb { width: 12px; height: 12px; margin-top: -4px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 30%); -webkit-appearance: none; appearance: none; transition: transform 120ms ease; }
.video-progress::-moz-range-track { height: 4px; border-radius: 999px; background: var(--track); }
.video-progress::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 30%); }
.video-progress:hover::-webkit-slider-thumb, .video-progress:active::-webkit-slider-thumb { transform: scale(1.2); }
.video-progress:focus-visible { outline: 2px solid #7ce5d5; outline-offset: -4px; border-radius: 6px; }
/* Volume: the speaker toggles mute; the slider slides out beside it on hover or keyboard focus. */
.video-volume { display: flex; flex: none; align-items: center; }
.video-volume-slider { --track: linear-gradient(to right, #fff var(--progress, 0%), rgb(255 255 255 / 28%) var(--progress, 0%)); width: 0; height: var(--control-size); margin: 0; padding: 0; opacity: 0; background: transparent; cursor: pointer; appearance: none; -webkit-appearance: none; transition: width 160ms ease, opacity 160ms ease, margin 160ms ease; }
.video-volume-slider::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: var(--track); }
.video-volume-slider::-webkit-slider-thumb { width: 10px; height: 10px; margin-top: -3px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 30%); -webkit-appearance: none; appearance: none; }
.video-volume-slider::-moz-range-track { height: 4px; border-radius: 999px; background: var(--track); }
.video-volume-slider::-moz-range-thumb { width: 10px; height: 10px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 30%); }
.video-volume:focus-within .video-volume-slider { width: clamp(48px, 12cqi, 80px); margin: 0 6px 0 2px; opacity: 1; }
.video-volume-slider:focus-visible { outline: 2px solid #7ce5d5; outline-offset: -4px; border-radius: 6px; }
@media (hover: hover) {
  .video-volume:hover .video-volume-slider { width: clamp(48px, 12cqi, 80px); margin: 0 6px 0 2px; opacity: 1; }
}
/* Narrow cards keep play, progress, sound and fullscreen; the rest come back once there is room. */
@container (max-width: 440px) { .video-skip, .video-speed { display: none; } }
@container (max-width: 300px) { .video-time { display: none; } }
/* The badge is part of the cover only: it leaves once playback starts and never shows in fullscreen. Controls return on hover or keyboard focus. */
.is-playing .video-controls { opacity: 0; }
.is-playing.controls-visible .video-controls, .is-playing .video-controls:has(:focus-visible) { opacity: 1; }
/* Mobile browsers keep :hover stuck after a tap, so hover only reveals controls for a real pointer. */
@media (hover: hover) {
  .is-playing:not(.is-fullscreen):hover .video-play-symbol, .is-playing:not(.is-fullscreen):hover .video-controls { opacity: 1; }
}
/* Before the first play the cover shows only the centre play button; once started, the centre symbol goes away for good
   and the bottom bar takes over. The whole-frame toggle stays so a click on the picture still plays or pauses. */
.creator-video-player:not(.has-started) .video-controls { visibility: hidden; opacity: 0; }
.has-started .video-play-symbol { display: none; }
/* Fullscreen playback with a resting mouse hides the cursor along with the controls. */
.is-fullscreen.is-playing:not(.controls-visible), .is-fullscreen.is-playing:not(.controls-visible) * { cursor: none; }
.video-playback-error { position: absolute; z-index: 3; bottom: calc(var(--control-inset) + var(--control-size) + 16px); left: 50%; transform: translateX(-50%); max-width: calc(100% - 32px); padding: 7px 10px; border-radius: var(--creator-radius-small, 8px); font-size: 11px; text-align: center; pointer-events: none; border: 1px solid var(--glass-border); color: #fff; background: var(--glass-bg); box-shadow: var(--glass-shadow); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); }
.video-load-error { position: absolute; z-index: 2; inset: 0; display: grid; justify-items: center; align-content: center; gap: 12px; color: #dcebe8; background: #142321; font-size: 13px; }
.video-load-error button { padding: 8px 14px; border: 1px solid #65988e; border-radius: var(--creator-radius, 12px); color: #dcebe8; background: #233e37; }
.creator-video-player:fullscreen { width: 100%; height: 100%; max-height: none !important; aspect-ratio: auto !important; margin: 0; border-radius: 0; background: #000; }
.creator-video-player:fullscreen video { max-height: none !important; }
@media (prefers-reduced-motion: reduce) { video, .video-badge, .video-play-symbol, .video-controls, .video-control, .video-progress::-webkit-slider-thumb { transition: none; } .video-skeleton::before { display: none; } }
</style>
